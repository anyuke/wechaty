/**
 *   Wechaty - https://github.com/chatie/wechaty
 *
 *   @copyright 2016-2017 Huan LI <zixia@zixia.net>
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 */
import * as fs              from 'fs'

import { log }              from '../config'

import {
  BrowserDriver,
  IWebDriverOptionsCookie,
}                           from './browser-driver'

/**
 * The reason that driverCookie type defined here
 * is because @types/selenium is not updated
 * with the latest 3.0 version of selenium.
 * 201610 zixia
 */
/**
 * Updated 201708 zixia Use IWebDriverOptionsCookie from selenium instead
 */
// export interface CookieType {
//   [index: string]: string | number | boolean,
//   name: string,
//   value: string,
//   path: string,
//   domain: string,
//   secure: boolean,
//   expiry: number,
// }

export class BrowserCookie {
  constructor(
    private driver: BrowserDriver,
    private storeFile?: string,
  ) {
    log.verbose('PuppetWebBrowserCookie', 'constructor(%s, %s)',
                                          driver.constructor.name,
                                          storeFile ? storeFile : '',
    )
  }

  public async read(): Promise<IWebDriverOptionsCookie[]> {
    // just check cookies, no file operation
    log.verbose('PuppetWebBrowserCookie', 'read()')

    // if (this.browser.dead()) {
    //   throw new Error('checkSession() - browser dead')
    // }

    try {
      const cookies = await this.driver.manage().getCookies()
      log.silly('PuppetWebBrowserCookie', 'read() %s', cookies.map(c => c.name).join(','))
      return cookies
    } catch (e) {
      log.error('PuppetWebBrowserCookie', 'read() getCookies() exception: %s', e && e.message || e)
      throw e
    }
  }

  public async clean(): Promise<void> {
    log.verbose('PuppetWebBrowserCookie', 'clean() file %s', this.storeFile)
    if (!this.storeFile) {
      return
    }

    // if (this.browser.dead())  { return Promise.reject(new Error('cleanSession() - browser dead'))}

    const storeFile = this.storeFile
    await new Promise((resolve, reject) => {
      fs.unlink(storeFile, err => {
        if (err && err.code !== 'ENOENT') {
          log.silly('PuppetWebBrowserCookie', 'clean() unlink store file %s fail: %s', storeFile, err.message)
        }
        resolve()
      })
    })
    return
  }

  public async save(): Promise<void> {
    if (!this.storeFile) {
      log.verbose('PuppetWebBrowserCookie', 'save() no store file')
      return
    }
    log.silly('PuppetWebBrowserCookie', 'save() to file %s', this.storeFile)

    const storeFile = this.storeFile

    // if (this.browser.dead()) {
    //   throw new Error('saveSession() - browser dead')
    // }

    function cookieFilter(cookies: IWebDriverOptionsCookie[]) {
      const skipNames = [
        'ChromeDriver',
        'MM_WX_SOUND_STATE',
        'MM_WX_NOTIFY_STATE',
      ]
      const skipNamesRegex = new RegExp(skipNames.join('|'), 'i')
      return cookies.filter(c => {
        if (skipNamesRegex.test(c.name)) { return false }
        // else if (!/wx\.qq\.com/i.test(c.domain))  { return false }
        else                             { return true }
      })
    }

    try {
      let cookies: IWebDriverOptionsCookie[] = await this.driver.manage().getCookies()
      cookies = cookieFilter(cookies)

      // log.silly('PuppetWebBrowserCookie', 'save() saving %d cookies for session: %s', cookies.length
      //   , require('util').inspect(cookies.map(c => { return {name: c.name, value: c.value, expiresType: typeof c.expiry, expiry: c.expiry} })))

      log.silly('PuppetWebBrowserCookie', 'save() saving %d cookies: %s', cookies.length, cookies.map(c => c.name).join(','))

      const jsonStr = JSON.stringify(cookies)

      await new Promise((resolve, reject) => {
        fs.writeFile(storeFile, jsonStr, err => {
          if (err) {
            log.error('PuppetWebBrowserCookie', 'save() fail to write file %s: %s', storeFile, err.errno)
            reject(err)
          }
          log.silly('PuppetWebBrowserCookie', 'save() %d cookies to %s', cookies.length, storeFile)
          resolve(cookies)
        })
      })

    } catch (e) {
      log.error('PuppetWebBrowserCookie', 'save() getCookies() exception: %s', e.message)
      throw e
    }
  }

  public async load(): Promise<void> {
    log.verbose('PuppetWebBrowserCookie', 'load() from %s', this.storeFile || '"undefined"')

    const cookies = this.getCookiesFromFile()

    if (!cookies) {
      log.silly('PuppetWebBrowserCookie', 'load() no cookies')
      return
    }

    try {
      await this.add(cookies)
      log.verbose('PuppetWebBrowserCookie', 'loaded session(%d cookies) from %s', cookies.length, this.storeFile)
    } catch (e) {
      log.error('PuppetWebBrowserCookie', 'load() add() exception: %s', e.message)
      throw e
    }
    return
  }

  public getCookiesFromFile(): IWebDriverOptionsCookie[] | null {
    log.verbose('PuppetWebBrowserCookie', 'getCookiesFromFile() from %s', this.storeFile || '"undefined"')

    try {
      if (!this.storeFile) {
        throw new Error('no store file')
      }
      fs.statSync(this.storeFile).isFile()
    } catch (err) {
      log.silly('PuppetWebBrowserCookie', 'getCookiesFromFile() no cookies: %s', err.message)
      return null
    }
    const jsonStr = fs.readFileSync(this.storeFile)
    const cookies = JSON.parse(jsonStr.toString())

    return cookies
  }

  public hostname(): string {
    log.verbose('PuppetWebBrowserCookie', 'hostname()')

    const DEFAULT_HOSTNAME = 'wx.qq.com'

    const cookieList = this.getCookiesFromFile()

    if (!cookieList || cookieList.length === 0) {
      log.silly('PuppetWebBrowserCookie', 'hostname() no cookie, return default hostname')
      return DEFAULT_HOSTNAME
    }

    const wxCookieList = cookieList.filter(c => /^webwx_auth_ticket|webwxuvid$/.test(c.name))
    if (!wxCookieList.length) {
      log.silly('PuppetWebBrowserCookie', 'hostname() no valid cookie in files, return default hostname')
      return DEFAULT_HOSTNAME
    }
    let domain = wxCookieList[0].domain
    if (!domain) {
      log.silly('PuppetWebBrowserCookie', 'hostname() no valid domain in cookies, return default hostname')
      return DEFAULT_HOSTNAME
    }

    domain = domain.slice(1)

    if (domain === 'wechat.com') {
      domain = 'web.wechat.com'
    }
    log.silly('PuppetWebBrowserCookie', 'hostname() got %s', domain)

    return domain
  }

  /**
   * only wrap addCookies for convinience
   *
   * use this.driver().manage() to call other functions like:
   * deleteCookie / getCookie / getCookies
   */
  // TypeScript Overloading: http://stackoverflow.com/a/21385587/1123955
  public async add(cookie: IWebDriverOptionsCookie | IWebDriverOptionsCookie[]): Promise<void> {

    if (Array.isArray(cookie)) {
      const cookieList = cookie
      log.verbose('PuppetWebBrowserCookie', 'add(Array.length = %d)', cookieList.length)
      for (const c of cookieList) {
        await this.add(c)
      }
      return
    }
    /**
     * convert expiry from seconds to milliseconds. https://github.com/SeleniumHQ/selenium/issues/2245
     * with selenium-webdriver v2.53.2
     * NOTICE: the lastest branch of selenium-webdriver for js has changed the interface of addCookie:
     * https://github.com/SeleniumHQ/selenium/commit/02f407976ca1d516826990f11aca7de3c16ba576
     */
    // if (cookie.expiry) { cookie.expiry = cookie.expiry * 1000 /* XXX: be aware of new version of webdriver */}

    log.silly('PuppetWebBrowserCookie', 'add(%s)', JSON.stringify(cookie))

    try {
      await this.driver
                .manage()
                .addCookie(cookie)
    } catch (e) {
      log.warn('PuppetWebBrowserCookie', 'add() exception: %s', e.message)
      throw e
    }
  }

}

export default BrowserCookie
