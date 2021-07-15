/* eslint-disable @typescript-eslint/no-unused-expressions,@typescript-eslint/require-await */

import 'mocha'
import { expect } from 'chai'
import { HttpStatusCode } from '@shared/core-utils'
import {
  cleanupTests,
  doubleFollow,
  flushAndRunMultipleServers,
  killallServers,
  makeGetRequest,
  MockBlocklist,
  reRunServer,
  ServerInfo,
  setAccessTokensToServers,
  wait
} from '@shared/extra-utils'

describe('Official plugin auto-mute', function () {
  const autoMuteListPath = '/plugins/auto-mute/router/api/v1/mute-list'
  let servers: ServerInfo[]
  let blocklistServer: MockBlocklist
  let port: number

  before(async function () {
    this.timeout(30000)

    servers = await flushAndRunMultipleServers(2)
    await setAccessTokensToServers(servers)

    for (const server of servers) {
      await server.pluginsCommand.install({ npmName: 'peertube-plugin-auto-mute' })
    }

    blocklistServer = new MockBlocklist()
    port = await blocklistServer.initialize()

    await await servers[0].videosCommand.quickUpload({ name: 'video server 1' })
    await await servers[1].videosCommand.quickUpload({ name: 'video server 2' })

    await doubleFollow(servers[0], servers[1])
  })

  it('Should update plugin settings', async function () {
    await servers[0].pluginsCommand.updateSettings({
      npmName: 'peertube-plugin-auto-mute',
      settings: {
        'blocklist-urls': `http://localhost:${port}/blocklist`,
        'check-seconds-interval': 1
      }
    })
  })

  it('Should add a server blocklist', async function () {
    this.timeout(10000)

    blocklistServer.replace({
      data: [
        {
          value: 'localhost:' + servers[1].port
        }
      ]
    })

    await wait(2000)

    const { total } = await servers[0].videosCommand.list()
    expect(total).to.equal(1)
  })

  it('Should remove a server blocklist', async function () {
    this.timeout(10000)

    blocklistServer.replace({
      data: [
        {
          value: 'localhost:' + servers[1].port,
          action: 'remove'
        }
      ]
    })

    await wait(2000)

    const { total } = await servers[0].videosCommand.list()
    expect(total).to.equal(2)
  })

  it('Should add an account blocklist', async function () {
    this.timeout(10000)

    blocklistServer.replace({
      data: [
        {
          value: 'root@localhost:' + servers[1].port
        }
      ]
    })

    await wait(2000)

    const { total } = await servers[0].videosCommand.list()
    expect(total).to.equal(1)
  })

  it('Should remove an account blocklist', async function () {
    this.timeout(10000)

    blocklistServer.replace({
      data: [
        {
          value: 'root@localhost:' + servers[1].port,
          action: 'remove'
        }
      ]
    })

    await wait(2000)

    const { total } = await servers[0].videosCommand.list()
    expect(total).to.equal(2)
  })

  it('Should auto mute an account, manually unmute it and do not remute it automatically', async function () {
    this.timeout(20000)

    const account = 'root@localhost:' + servers[1].port

    blocklistServer.replace({
      data: [
        {
          value: account,
          updatedAt: new Date().toISOString()
        }
      ]
    })

    await wait(2000)

    {
      const { total } = await servers[0].videosCommand.list()
      expect(total).to.equal(1)
    }

    await servers[0].blocklistCommand.removeFromServerBlocklist({ account })

    {
      const { total } = await servers[0].videosCommand.list()
      expect(total).to.equal(2)
    }

    await killallServers([ servers[0] ])
    await reRunServer(servers[0])
    await wait(2000)

    {
      const { total } = await servers[0].videosCommand.list()
      expect(total).to.equal(2)
    }
  })

  it('Should not expose the auto mute list', async function () {
    await makeGetRequest({
      url: servers[0].url,
      path: '/plugins/auto-mute/router/api/v1/mute-list',
      statusCodeExpected: HttpStatusCode.FORBIDDEN_403
    })
  })

  it('Should enable auto mute list', async function () {
    await servers[0].pluginsCommand.updateSettings({
      npmName: 'peertube-plugin-auto-mute',
      settings: {
        'blocklist-urls': '',
        'check-seconds-interval': 1,
        'expose-mute-list': true
      }
    })

    await makeGetRequest({
      url: servers[0].url,
      path: '/plugins/auto-mute/router/api/v1/mute-list',
      statusCodeExpected: HttpStatusCode.OK_200
    })
  })

  it('Should mute an account on server 1, and server 2 auto mutes it', async function () {
    this.timeout(20000)

    await servers[1].pluginsCommand.updateSettings({
      npmName: 'peertube-plugin-auto-mute',
      settings: {
        'blocklist-urls': 'http://localhost:' + servers[0].port + autoMuteListPath,
        'check-seconds-interval': 1,
        'expose-mute-list': false
      }
    })

    await servers[0].blocklistCommand.addToServerBlocklist({ account: 'root@localhost:' + servers[1].port })
    await servers[0].blocklistCommand.addToMyBlocklist({ server: 'localhost:' + servers[1].port })

    const res = await makeGetRequest({
      url: servers[0].url,
      path: '/plugins/auto-mute/router/api/v1/mute-list',
      statusCodeExpected: HttpStatusCode.OK_200
    })

    const data = res.body.data
    expect(data).to.have.lengthOf(1)
    expect(data[0].updatedAt).to.exist
    expect(data[0].value).to.equal('root@localhost:' + servers[1].port)

    await wait(2000)

    for (const server of servers) {
      const { total } = await server.videosCommand.list()
      expect(total).to.equal(1)
    }
  })

  after(async function () {
    await blocklistServer.terminate()

    await cleanupTests(servers)
  })
})
