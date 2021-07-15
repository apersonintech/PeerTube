/* eslint-disable @typescript-eslint/no-unused-expressions,@typescript-eslint/require-await */

import 'mocha'
import { omit } from 'lodash'
import { HttpStatusCode } from '@shared/core-utils'
import {
  buildAbsoluteFixturePath,
  cleanupTests,
  flushAndRunServer,
  LiveCommand,
  makePostBodyRequest,
  makeUploadRequest,
  sendRTMPStream,
  ServerInfo,
  setAccessTokensToServers,
  stopFfmpeg
} from '@shared/extra-utils'
import { VideoCreateResult, VideoPrivacy } from '@shared/models'

describe('Test video lives API validator', function () {
  const path = '/api/v1/videos/live'
  let server: ServerInfo
  let userAccessToken = ''
  let channelId: number
  let video: VideoCreateResult
  let videoIdNotLive: number
  let command: LiveCommand

  // ---------------------------------------------------------------

  before(async function () {
    this.timeout(30000)

    server = await flushAndRunServer(1)

    await setAccessTokensToServers([ server ])

    await server.configCommand.updateCustomSubConfig({
      newConfig: {
        live: {
          enabled: true,
          maxInstanceLives: 20,
          maxUserLives: 20,
          allowReplay: true
        }
      }
    })

    const username = 'user1'
    const password = 'my super password'
    await server.usersCommand.create({ username: username, password: password })
    userAccessToken = await server.loginCommand.getAccessToken({ username, password })

    {
      const { videoChannels } = await server.usersCommand.getMyInfo()
      channelId = videoChannels[0].id
    }

    {
      videoIdNotLive = (await server.videosCommand.quickUpload({ name: 'not live' })).id
    }

    command = server.liveCommand
  })

  describe('When creating a live', function () {
    let baseCorrectParams

    before(function () {
      baseCorrectParams = {
        name: 'my super name',
        category: 5,
        licence: 1,
        language: 'pt',
        nsfw: false,
        commentsEnabled: true,
        downloadEnabled: true,
        waitTranscoding: true,
        description: 'my super description',
        support: 'my super support text',
        tags: [ 'tag1', 'tag2' ],
        privacy: VideoPrivacy.PUBLIC,
        channelId,
        saveReplay: false,
        permanentLive: false
      }
    })

    it('Should fail with nothing', async function () {
      const fields = {}
      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with a long name', async function () {
      const fields = { ...baseCorrectParams, name: 'super'.repeat(65) }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with a bad category', async function () {
      const fields = { ...baseCorrectParams, category: 125 }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with a bad licence', async function () {
      const fields = { ...baseCorrectParams, licence: 125 }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with a bad language', async function () {
      const fields = { ...baseCorrectParams, language: 'a'.repeat(15) }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with a long description', async function () {
      const fields = { ...baseCorrectParams, description: 'super'.repeat(2500) }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with a long support text', async function () {
      const fields = { ...baseCorrectParams, support: 'super'.repeat(201) }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail without a channel', async function () {
      const fields = omit(baseCorrectParams, 'channelId')

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with a bad channel', async function () {
      const fields = { ...baseCorrectParams, channelId: 545454 }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with another user channel', async function () {
      const user = {
        username: 'fake',
        password: 'fake_password'
      }
      await server.usersCommand.create({ username: user.username, password: user.password })

      const accessTokenUser = await server.loginCommand.getAccessToken(user)
      const { videoChannels } = await server.usersCommand.getMyInfo({ token: accessTokenUser })
      const customChannelId = videoChannels[0].id

      const fields = { ...baseCorrectParams, channelId: customChannelId }

      await makePostBodyRequest({ url: server.url, path, token: userAccessToken, fields })
    })

    it('Should fail with too many tags', async function () {
      const fields = { ...baseCorrectParams, tags: [ 'tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6' ] }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with a tag length too low', async function () {
      const fields = { ...baseCorrectParams, tags: [ 'tag1', 't' ] }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with a tag length too big', async function () {
      const fields = { ...baseCorrectParams, tags: [ 'tag1', 'my_super_tag_too_long_long_long_long_long_long' ] }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should fail with an incorrect thumbnail file', async function () {
      const fields = baseCorrectParams
      const attaches = {
        thumbnailfile: buildAbsoluteFixturePath('video_short.mp4')
      }

      await makeUploadRequest({ url: server.url, path, token: server.accessToken, fields, attaches })
    })

    it('Should fail with a big thumbnail file', async function () {
      const fields = baseCorrectParams
      const attaches = {
        thumbnailfile: buildAbsoluteFixturePath('preview-big.png')
      }

      await makeUploadRequest({ url: server.url, path, token: server.accessToken, fields, attaches })
    })

    it('Should fail with an incorrect preview file', async function () {
      const fields = baseCorrectParams
      const attaches = {
        previewfile: buildAbsoluteFixturePath('video_short.mp4')
      }

      await makeUploadRequest({ url: server.url, path, token: server.accessToken, fields, attaches })
    })

    it('Should fail with a big preview file', async function () {
      const fields = baseCorrectParams
      const attaches = {
        previewfile: buildAbsoluteFixturePath('preview-big.png')
      }

      await makeUploadRequest({ url: server.url, path, token: server.accessToken, fields, attaches })
    })

    it('Should fail with save replay and permanent live set to true', async function () {
      const fields = { ...baseCorrectParams, saveReplay: true, permanentLive: true }

      await makePostBodyRequest({ url: server.url, path, token: server.accessToken, fields })
    })

    it('Should succeed with the correct parameters', async function () {
      this.timeout(30000)

      const res = await makePostBodyRequest({
        url: server.url,
        path,
        token: server.accessToken,
        fields: baseCorrectParams,
        statusCodeExpected: HttpStatusCode.OK_200
      })

      video = res.body.video
    })

    it('Should forbid if live is disabled', async function () {
      await server.configCommand.updateCustomSubConfig({
        newConfig: {
          live: {
            enabled: false
          }
        }
      })

      await makePostBodyRequest({
        url: server.url,
        path,
        token: server.accessToken,
        fields: baseCorrectParams,
        statusCodeExpected: HttpStatusCode.FORBIDDEN_403
      })
    })

    it('Should forbid to save replay if not enabled by the admin', async function () {
      const fields = { ...baseCorrectParams, saveReplay: true }

      await server.configCommand.updateCustomSubConfig({
        newConfig: {
          live: {
            enabled: true,
            allowReplay: false
          }
        }
      })

      await makePostBodyRequest({
        url: server.url,
        path,
        token: server.accessToken,
        fields,
        statusCodeExpected: HttpStatusCode.FORBIDDEN_403
      })
    })

    it('Should allow to save replay if enabled by the admin', async function () {
      const fields = { ...baseCorrectParams, saveReplay: true }

      await server.configCommand.updateCustomSubConfig({
        newConfig: {
          live: {
            enabled: true,
            allowReplay: true
          }
        }
      })

      await makePostBodyRequest({
        url: server.url,
        path,
        token: server.accessToken,
        fields,
        statusCodeExpected: HttpStatusCode.OK_200
      })
    })

    it('Should not allow live if max instance lives is reached', async function () {
      await server.configCommand.updateCustomSubConfig({
        newConfig: {
          live: {
            enabled: true,
            maxInstanceLives: 1
          }
        }
      })

      await makePostBodyRequest({
        url: server.url,
        path,
        token: server.accessToken,
        fields: baseCorrectParams,
        statusCodeExpected: HttpStatusCode.FORBIDDEN_403
      })
    })

    it('Should not allow live if max user lives is reached', async function () {
      await server.configCommand.updateCustomSubConfig({
        newConfig: {
          live: {
            enabled: true,
            maxInstanceLives: 20,
            maxUserLives: 1
          }
        }
      })

      await makePostBodyRequest({
        url: server.url,
        path,
        token: server.accessToken,
        fields: baseCorrectParams,
        statusCodeExpected: HttpStatusCode.FORBIDDEN_403
      })
    })
  })

  describe('When getting live information', function () {

    it('Should fail without access token', async function () {
      await command.get({ token: '', videoId: video.id, expectedStatus: HttpStatusCode.UNAUTHORIZED_401 })
    })

    it('Should fail with a bad access token', async function () {
      await command.get({ token: 'toto', videoId: video.id, expectedStatus: HttpStatusCode.UNAUTHORIZED_401 })
    })

    it('Should fail with access token of another user', async function () {
      await command.get({ token: userAccessToken, videoId: video.id, expectedStatus: HttpStatusCode.FORBIDDEN_403 })
    })

    it('Should fail with a bad video id', async function () {
      await command.get({ videoId: 'toto', expectedStatus: HttpStatusCode.BAD_REQUEST_400 })
    })

    it('Should fail with an unknown video id', async function () {
      await command.get({ videoId: 454555, expectedStatus: HttpStatusCode.NOT_FOUND_404 })
    })

    it('Should fail with a non live video', async function () {
      await command.get({ videoId: videoIdNotLive, expectedStatus: HttpStatusCode.NOT_FOUND_404 })
    })

    it('Should succeed with the correct params', async function () {
      await command.get({ videoId: video.id })
      await command.get({ videoId: video.uuid })
      await command.get({ videoId: video.shortUUID })
    })
  })

  describe('When updating live information', async function () {

    it('Should fail without access token', async function () {
      await command.update({ token: '', videoId: video.id, fields: {}, expectedStatus: HttpStatusCode.UNAUTHORIZED_401 })
    })

    it('Should fail with a bad access token', async function () {
      await command.update({ token: 'toto', videoId: video.id, fields: {}, expectedStatus: HttpStatusCode.UNAUTHORIZED_401 })
    })

    it('Should fail with access token of another user', async function () {
      await command.update({ token: userAccessToken, videoId: video.id, fields: {}, expectedStatus: HttpStatusCode.FORBIDDEN_403 })
    })

    it('Should fail with a bad video id', async function () {
      await command.update({ videoId: 'toto', fields: {}, expectedStatus: HttpStatusCode.BAD_REQUEST_400 })
    })

    it('Should fail with an unknown video id', async function () {
      await command.update({ videoId: 454555, fields: {}, expectedStatus: HttpStatusCode.NOT_FOUND_404 })
    })

    it('Should fail with a non live video', async function () {
      await command.update({ videoId: videoIdNotLive, fields: {}, expectedStatus: HttpStatusCode.NOT_FOUND_404 })
    })

    it('Should fail with save replay and permanent live set to true', async function () {
      const fields = { saveReplay: true, permanentLive: true }

      await command.update({ videoId: video.id, fields, expectedStatus: HttpStatusCode.BAD_REQUEST_400 })
    })

    it('Should succeed with the correct params', async function () {
      await command.update({ videoId: video.id, fields: { saveReplay: false } })
      await command.update({ videoId: video.uuid, fields: { saveReplay: false } })
      await command.update({ videoId: video.shortUUID, fields: { saveReplay: false } })
    })

    it('Should fail to update replay status if replay is not allowed on the instance', async function () {
      await server.configCommand.updateCustomSubConfig({
        newConfig: {
          live: {
            enabled: true,
            allowReplay: false
          }
        }
      })

      await command.update({ videoId: video.id, fields: { saveReplay: true }, expectedStatus: HttpStatusCode.FORBIDDEN_403 })
    })

    it('Should fail to update a live if it has already started', async function () {
      this.timeout(40000)

      const live = await command.get({ videoId: video.id })

      const ffmpegCommand = sendRTMPStream(live.rtmpUrl, live.streamKey)

      await command.waitUntilPublished({ videoId: video.id })
      await command.update({ videoId: video.id, fields: {}, expectedStatus: HttpStatusCode.BAD_REQUEST_400 })

      await stopFfmpeg(ffmpegCommand)
    })

    it('Should fail to stream twice in the save live', async function () {
      this.timeout(40000)

      const live = await command.get({ videoId: video.id })

      const ffmpegCommand = sendRTMPStream(live.rtmpUrl, live.streamKey)

      await command.waitUntilPublished({ videoId: video.id })

      await command.runAndTestStreamError({ videoId: video.id, shouldHaveError: true })

      await stopFfmpeg(ffmpegCommand)
    })
  })

  after(async function () {
    await cleanupTests([ server ])
  })
})
