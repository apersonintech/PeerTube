import 'mocha'
import { expect } from 'chai'
import { writeFile } from 'fs-extra'
import { basename, join } from 'path'
import { HttpStatusCode } from '@shared/core-utils'
import { Video } from '@shared/models'
import {
  cleanupTests,
  doubleFollow,
  flushAndRunMultipleServers,
  makeRawRequest,
  ServerInfo,
  setAccessTokensToServers,
  waitJobs
} from '../../../shared/extra-utils'

async function testThumbnail (server: ServerInfo, videoId: number | string) {
  const video = await server.videosCommand.get({ id: videoId })

  const requests = [
    makeRawRequest(join(server.url, video.thumbnailPath), HttpStatusCode.OK_200),
    makeRawRequest(join(server.url, video.thumbnailPath), HttpStatusCode.OK_200)
  ]

  for (const req of requests) {
    const res = await req
    expect(res.body).to.not.have.lengthOf(0)
  }
}

describe('Test regenerate thumbnails script', function () {
  let servers: ServerInfo[]

  let video1: Video
  let video2: Video
  let remoteVideo: Video

  let thumbnail1Path: string
  let thumbnailRemotePath: string

  before(async function () {
    this.timeout(60000)

    servers = await flushAndRunMultipleServers(2)
    await setAccessTokensToServers(servers)

    await doubleFollow(servers[0], servers[1])

    {
      const videoUUID1 = (await servers[0].videosCommand.quickUpload({ name: 'video 1' })).uuid
      video1 = await servers[0].videosCommand.get({ id: videoUUID1 })

      thumbnail1Path = join(servers[0].serversCommand.buildDirectory('thumbnails'), basename(video1.thumbnailPath))

      const videoUUID2 = (await servers[0].videosCommand.quickUpload({ name: 'video 2' })).uuid
      video2 = await servers[0].videosCommand.get({ id: videoUUID2 })
    }

    {
      const videoUUID = (await servers[1].videosCommand.quickUpload({ name: 'video 3' })).uuid
      await waitJobs(servers)

      remoteVideo = await servers[0].videosCommand.get({ id: videoUUID })

      thumbnailRemotePath = join(servers[0].serversCommand.buildDirectory('thumbnails'), basename(remoteVideo.thumbnailPath))
    }

    await writeFile(thumbnail1Path, '')
    await writeFile(thumbnailRemotePath, '')
  })

  it('Should have empty thumbnails', async function () {
    {
      const res = await makeRawRequest(join(servers[0].url, video1.thumbnailPath), HttpStatusCode.OK_200)
      expect(res.body).to.have.lengthOf(0)
    }

    {
      const res = await makeRawRequest(join(servers[0].url, video2.thumbnailPath), HttpStatusCode.OK_200)
      expect(res.body).to.not.have.lengthOf(0)
    }

    {
      const res = await makeRawRequest(join(servers[0].url, remoteVideo.thumbnailPath), HttpStatusCode.OK_200)
      expect(res.body).to.have.lengthOf(0)
    }
  })

  it('Should regenerate local thumbnails from the CLI', async function () {
    this.timeout(15000)

    await servers[0].cliCommand.execWithEnv(`npm run regenerate-thumbnails`)
  })

  it('Should have generated new thumbnail files', async function () {
    await testThumbnail(servers[0], video1.uuid)
    await testThumbnail(servers[0], video2.uuid)

    const res = await makeRawRequest(join(servers[0].url, remoteVideo.thumbnailPath), HttpStatusCode.OK_200)
    expect(res.body).to.have.lengthOf(0)
  })

  it('Should have deleted old thumbnail files', async function () {
    {
      await makeRawRequest(join(servers[0].url, video1.thumbnailPath), HttpStatusCode.NOT_FOUND_404)
    }

    {
      await makeRawRequest(join(servers[0].url, video2.thumbnailPath), HttpStatusCode.NOT_FOUND_404)
    }

    {
      const res = await makeRawRequest(join(servers[0].url, remoteVideo.thumbnailPath), HttpStatusCode.OK_200)
      expect(res.body).to.have.lengthOf(0)
    }
  })

  after(async function () {
    await cleanupTests(servers)
  })
})
