/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Bookmarks Sync.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Chris Beard <chris@mozilla.com>
 *  Dan Mills <thunder@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const EXPORTED_SYMBOLS = ['ClientData'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://weave/crypto.js");
Cu.import("resource://weave/dav.js");
Cu.import("resource://weave/remote.js");
Cu.import("resource://weave/identity.js");
Cu.import("resource://weave/async.js");

Function.prototype.async = Async.sugar;

Utils.lazy(this, 'ClientData', ClientDataSvc);

function ClientDataSvc() {
  this._log = Log4Moz.Service.getLogger("Service.ClientData");
}
ClientDataSvc.prototype = {
  getClientData: function ClientData_getClientData() {
    let self = yield;

    DAV.MKCOL("meta", self.cb);
    let ret = yield;
    if(!ret)
      throw "Could not create meta information directory";

    DAV.GET("meta/clients", self.cb);
    let ret = yield;

    if (Utils.checkStatus(ret.status)) {
      this._log.debug("Could not get clients file from server");
      self.done(false);
      return;
    }

    this._ClientData = this._json.decode(ret.responseText);

    this._log.debug("Successfully downloaded clients file from server");
    self.done(true);
  },

  uploadClientData: function ClientData_uploadClientData() {
    let self = yield;
    let json = this._json.encode(this._ClientData);

    DAV.MKCOL("meta", self.cb);
    let ret = yield;
    if(!ret)
      throw "Could not create meta information directory";

    DAV.PUT("meta/clients", json, self.cb);
    let ret = yield;

    if(Utils.checkStatus(ret.status)) {
      this._log.debug("Could not upload clients file from server");
      self.done(false);
      return;
    }

    this._log.debug("Successfully uploaded clients file to server");
    self.done(true);
  }
};