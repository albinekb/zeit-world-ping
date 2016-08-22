#!/usr/bin/env node
'use strict'

const got = require('got')
const $ = require('cheerio')
const chalk = require('chalk')
const Listr = require('listr')
const tcpp = require('tcp-ping')
const Table = require('easy-table')

const URL = 'https://zeit.co/world'
const PORT = 53
const ATTEMPTS = 10

const ping = (address) => new Promise((resolve, reject) => {
  tcpp.ping({
    address,
    attempts: ATTEMPTS,
    port: PORT}, function (err, data) {
    if (err) reject(err)
    resolve(data)
  })
})

const getNameServers = function () {
  return got(URL).then(res => {
    const page = $.load(res.body)

    return Array.from(page('.___world_tbody_tag tr')).map(row => {
      const cols = $(row).find('td')

      return {
        domain: $(cols[0]).text(),
        ip: $(cols[1]).text()
      }
    })
  })
}

let nameservers = []
let pings = []

const tasks = new Listr([
  {
    title: `Fetch nameservers from ${URL}`,
    task: () => getNameServers().then(res => {
      nameservers = res
    })
  },
  {
    title: `Determine ping to nameservers`,
    task: () => {
      return new Listr(nameservers.map(({domain, ip}) => ({
        title: `Pinging ${domain}`,
        task: () => ping(domain).then(res => pings.push(res))
      })))
    }
  }
])

const renderPing = (p, alt) => {
  const ping = p.toFixed(2)
  if (ping > 100) return chalk.red(alt || ping)
  if (ping < 40) return chalk.green(alt || ping)
  return chalk.white(alt || ping)
}

tasks.run().then(res => {
  console.log('\n')
  const t = new Table()

  pings.sort((a, b) => {
    if (a.avg < b.avg) return -1
    if (a.avg > b.avg) return 1
    return 0
  })

  const attempts = chalk.gray(`of ${ATTEMPTS}`)

  pings.forEach(function (ping, idx) {
    t.cell(chalk.bold.white('Nameserver'), renderPing(ping.avg, ping.address))
    t.cell(chalk.bold.white(`Avg ${attempts}`), renderPing(ping.avg))
    t.cell(chalk.italic.green('Min'), renderPing(ping.min))
    t.cell(chalk.italic.red('Max'), renderPing(ping.max))
    t.newRow()
  })

  console.log(t.toString())
}).catch(err => {
  console.error(err)
})
