jest.mock('@/main', () => {
  return {
    TokenWorker: {
      postMessage: jest.fn()
    }
  }
})

import sinon from 'sinon'
import store from '@/store'
import authNavGuard from '@/middleware/authNavGuard'
import { MOCK_AUTHORIZATION_TOKEN } from '../store/mockTokens'

describe('Auth Nav Guard', () => {
  let dispatchStub
  beforeEach(() => {
    dispatchStub = sinon.stub(store, ['dispatch'])
    dispatchStub.callThrough()
  })

  afterEach(() => {
    store.dispatch.restore()
    store.commit('user/unsetUser')
    store.commit('auth/isAuthenticated', false)
    store.commit('auth/error', false)
    store.commit('auth/unsetAuthorizationToken')
    store.commit('auth/unsetAuthorizationTokenExpiry')
    store.commit('api/unsetBackend')
    store.commit('auth/unsetRedirectRoute')
  })

  describe('...when the backend is server', () => {
    it('bypasses auth', async () => {
      store.commit('api/setBackend', 'SERVER')
      expect(store.getters['api/isServer']).toBe(true)
      const next = jest.fn()
      await authNavGuard({}, {}, next)
      expect(next).toHaveBeenCalledWith()
    })
  })

  describe('...when the backend is Cloud and the user is neither authenticated authorized', () => {
    it('calls the authentication route', async () => {
      // Having trouble mocking 'authenticate' here to see if it's called so mocking the result of that call with dispatchStub and checking that 'authenticate' is passed by checking that the instructions passed in dispatchStub are followed
      dispatchStub.withArgs('auth/authorize').callsFake()
      dispatchStub.withArgs('auth/authenticate').callsFake(async () => {
        store.commit('auth/isAuthenticated', true)
      })
      expect(store.getters['auth/isAuthorized']).toBe(false)
      expect(store.getters['auth/isAuthenticated']).toBe(false)
      const next = jest.fn()
      await authNavGuard({}, {}, next)
      expect(store.getters['auth/isAuthenticated']).toBe(true)
    })

    it('calls the authorization route', async () => {
      //see above about not being able to spy on dispatch but mocking calls and then testing the correct info is passed
      const expiry = new Date().getTime() + 100000000
      dispatchStub.withArgs('user/getUser').callsFake(async () => {
        store.commit('user/user', { name: 'test_user' })
      })
      dispatchStub.withArgs('auth/authorize').callsFake(async () => {
        store.commit('auth/authorizationToken', MOCK_AUTHORIZATION_TOKEN)
        store.commit('auth/authorizationTokenExpiry', expiry)
      })
      dispatchStub.withArgs('auth/authenticate').callsFake(async () => {
        store.commit('auth/isAuthenticated', true)
      })
      expect(store.getters['auth/isAuthorized']).toBe(false)
      expect(store.getters['auth/isAuthenticated']).toBe(false)
      const next = jest.fn()
      await authNavGuard({}, {}, next)
      expect(store.getters['auth/isAuthorized']).toBe(true)
      expect(store.getters['auth/authorizationToken']).toEqual(
        MOCK_AUTHORIZATION_TOKEN
      )
      expect(store.getters['auth/authorizationTokenExpiry']).toEqual(expiry)
    })
  })

  it('calls the getUser route', async () => {
    store.commit('auth/isAuthenticated', true)
    store.commit('auth/authorizationToken', MOCK_AUTHORIZATION_TOKEN)
    store.commit(
      'auth/authorizationTokenExpiry',
      new Date().getTime() + 100000000
    )
    dispatchStub.withArgs('user/getUser').callsFake(async () => {
      store.commit('user/user', { first_name: 'test_user123' })
    })
    const next = jest.fn()
    expect(store.getters['user/userIsSet']).toBe(false)
    await authNavGuard({}, {}, next)
    expect(store.getters['user/userIsSet']).toBe(true)
    expect(store.getters['user/firstName']).toEqual('test_user123')
  })

  it('calls next when the user is authorized, authenticated, and set', () => {
    store.commit('user/user', { name: 'test_user' })
    store.commit('auth/isAuthenticated', true)
    store.commit('auth/authorizationToken', MOCK_AUTHORIZATION_TOKEN)
    store.commit(
      'auth/authorizationTokenExpiry',
      new Date().getTime() + 100000000
    )
    const next = jest.fn()
    authNavGuard({}, {}, next)
    // We test here that next was called *with no arguments*
    // explicitly, since that has a big impact on what the method does
    // in the navguard
    expect(next).toHaveBeenCalledWith()
  })

  it('aborts navigation when the user cannot be authenticated', async () => {
    dispatchStub.withArgs('auth/authenticate').callsFake(async () => {
      store.commit('auth/isAuthenticated', false)
    })
    dispatchStub.withArgs('auth/authorize').callsFake(async () => {
      store.commit(
        'auth/authorizationTokenExpiry',
        new Date().getTime() + 100000000
      )
      store.commit('auth/authorizationToken', MOCK_AUTHORIZATION_TOKEN)
    })
    store.commit('auth/error', false)
    const next = jest.fn()
    await authNavGuard({}, {}, next)
    expect(next).toHaveBeenCalledWith(false)
  })

  it('redirects to the access-denied page when the user cannot be authenticated and an access_denied error is present', async () => {
    dispatchStub.withArgs('auth/authenticate').callsFake(async () => {
      store.commit('auth/isAuthenticated', false)
    })
    dispatchStub.withArgs('auth/authorize').callsFake(async () => {
      store.commit(
        'auth/authorizationTokenExpiry',
        new Date().getTime() + 100000000
      )
      store.commit('auth/authorizationToken', MOCK_AUTHORIZATION_TOKEN)
    })
    store.commit('auth/error', 'access_denied')
    const next = jest.fn()
    await authNavGuard({}, {}, next)
    expect(next).toHaveBeenCalledWith({ name: 'access-denied' })
  })

  it('aborts navigation if authorization fails', async () => {
    store.commit('auth/isAuthenticated', true)
    dispatchStub.withArgs('auth/authorize').resolves()
    const next = jest.fn()
    expect(store.getters['auth/isAuthorized']).toBe(false)
    expect(store.getters['auth/isAuthenticated']).toBe(true)
    await authNavGuard({}, {}, next)
    expect(store.getters['auth/isAuthorized']).toBe(false)
    expect(store.getters['auth/isAuthenticated']).toBe(true)
    expect(next).toHaveBeenCalledWith(false)
  })

  it('calls next with a redirect route, if one is present in the store', async () => {
    let redirectRoute = '/some/path'
    store.commit('auth/isAuthenticated', true)
    store.commit('auth/authorizationToken', MOCK_AUTHORIZATION_TOKEN)
    store.commit(
      'auth/authorizationTokenExpiry',
      new Date().getTime() + 100000000
    )
    dispatchStub.withArgs('user/getUser').callsFake(async () => {
      store.commit('user/user', { name: 'test_user' })
    })
    store.commit('auth/redirectRoute', redirectRoute)
    expect(store.getters['auth/redirectRoute']).toBe(redirectRoute)
    const next = jest.fn()
    await authNavGuard({}, {}, next)
    expect(next).toHaveBeenCalledWith({ path: redirectRoute })
  })
})
