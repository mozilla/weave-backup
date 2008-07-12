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
 *  Dan Mills <thunder@mozilla.com>
 *  Chris Beard <cbeard@mozilla.com>
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

function Sync() {
  this._log = Log4Moz.Service.getLogger("Chrome.Window");

  this._log.info("Initializing Weave UI");

  this._os.addObserver(this, "weave:service:login:start", false);
  this._os.addObserver(this, "weave:service:login:success", false);
  this._os.addObserver(this, "weave:service:login:error", false);
  this._os.addObserver(this, "weave:service:logout:success", false);
  this._os.addObserver(this, "weave:service:sync:start", false);
  this._os.addObserver(this, "weave:service:sync:success", false);
  this._os.addObserver(this, "weave:service:sync:error", false);
  this._os.addObserver(this, "weave:notification:added", false);
  this._os.addObserver(this, "weave:notification:removed", false);
  this._os.addObserver(this, "weave:store:tabs:virtual:created", false);
  this._os.addObserver(this, "weave:store:tabs:virtual:removed", false);

  if (Weave.Utils.prefs.getBoolPref("ui.syncnow"))
    document.getElementById("sync-syncnowitem").setAttribute("hidden", false);

  if (Weave.Utils.prefs.getCharPref("lastversion") == "firstrun") {
    let url = "http://services.mozilla.com/firstrun/?version=" +
      Weave.WEAVE_VERSION;
    setTimeout(function() { window.openUILinkIn(url, "tab"); }, 500);

  } else if (Weave.Utils.prefs.getCharPref("lastversion") != Weave.WEAVE_VERSION) {
    let url = "http://services.mozilla.com/updated/?version=" +
      Weave.WEAVE_VERSION;
    setTimeout(function() { window.openUILinkIn(url, "tab"); }, 500);
  }

  // FIXME: hack
  if (Weave.Utils.prefs.getCharPref("lastversion") == "0.1.30" ||
      Weave.Utils.prefs.getCharPref("lastversion") == "0.1.32" ||
      Weave.Utils.prefs.getCharPref("lastversion") == "0.1.33" ||
      Weave.Utils.prefs.getCharPref("lastversion") == "0.1.34") {
    this._prefSvc.setCharPref("extensions.weave.username", "nobody");
    setTimeout(function() {
      alert("Due to server changes you need to re-run the setup wizard.\n" +
            "If this is the first computer you upgrade to version " +
            Weave.WEAVE_VERSION + ", you MUST create a new account.");
    }, 500);
  }

  Weave.Utils.prefs.setCharPref("lastversion", Weave.WEAVE_VERSION);

  let username = this._prefSvc.getCharPref("extensions.weave.username");
  if (!username || username == 'nobody') {
      setTimeout(function() { gSync.doOpenSetupWizard(); }, 500);
  }

  // TODO: This is a fix for the general case of bug 436936.  It will
  // not support marginal cases such as when a new browser window is
  // opened in the middle of signing-in or syncing.
  if (Weave.Service.isInitialized)
    this._onLogin();

  Weave.Service.onWindowOpened();

  // Display a tabs notification if there are any virtual tabs.
  this._onVirtualTabsChanged();
}
Sync.prototype = {
  get _isTopBrowserWindow() {
    // TODO: This code is mostly just a workaround that ensures that only one
    // browser window ever performs any actions that are meant to only
    // be performed once in response to a weave event.  Ideally, such code
    // should not be handled by browser windows, but instead by e.g. actual
    // singleton services.
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var win = wm.getMostRecentWindow("navigator:browser");
    return (win == window);
  },

  __os: null,
  get _os() {
    if (!this.__os)
      this.__os = Cc["@mozilla.org/observer-service;1"]
        .getService(Ci.nsIObserverService);
    return this.__os;
  },

  __prefSvc: null,
  get _prefSvc() {
    if (!this.__prefSvc) {
      this.__prefSvc = Cc["@mozilla.org/preferences-service;1"]
        .getService(Ci.nsIPrefBranch);
      this.__prefSvc.QueryInterface(Ci.nsIPrefBranch2);
    }
    return this.__prefSvc;
  },

  _getPref: function(prefName, defaultValue) {
    let prefSvc = this._prefSvc;

    try {
      switch (prefSvc.getPrefType(prefName)) {
        case Ci.nsIPrefBranch.PREF_STRING:
          return prefSvc.getCharPref(prefName);
        case Ci.nsIPrefBranch.PREF_INT:
          return prefSvc.getIntPref(prefName);
        case Ci.nsIPrefBranch.PREF_BOOL:
          return prefSvc.getBoolPref(prefName);
      }
    }
    catch (ex) {}

    return defaultValue;
  },

  get _baseURL() {
    return this._getPref("extensions.weave.serverURL");
  },

  get _locale() {
    switch (this._getPref("general.useragent.locale", "en-US")) {
      case 'ja':
      case 'ja-JP-mac':
        return "ja";
    }

    return "en-US";
  },

  get _stringBundle() {
    let stringBundle = document.getElementById("weaveStringBundle");
    this.__defineGetter__("_stringBundle",
                          function() { return stringBundle; });
    return this._stringBundle;
  },

  get _sessionStore() {
    let sessionStore = Cc["@mozilla.org/browser/sessionstore;1"].
		       getService(Ci.nsISessionStore);
    this.__defineGetter__("_sessionStore", function() sessionStore);
    return this._sessionStore;
  },

  get _json() {
    let json = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
    this.__defineGetter__("_json", function() json);
    return this._json;
  },

  get _windowType() {
    let wm = Cc["@mozilla.org/appshell/window-mediator;1"].
             getService(Ci.nsIWindowMediator);
	let win = wm.getMostRecentWindow("");
	return win.document.documentElement.getAttribute("windowtype");
  },

  _openWindow: function Sync__openWindow(type, uri, options) {
    let wm = Cc["@mozilla.org/appshell/window-mediator;1"].
      getService(Ci.nsIWindowMediator);
    let window = wm.getMostRecentWindow(type);
    if (window)
      window.focus();
     else {
       var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].
         getService(Ci.nsIWindowWatcher);
       if (!options)
         options = 'chrome,centerscreen,dialog,modal,resizable=yes';
       ww.activeWindow.openDialog(uri, '', options, null);
     }
  },

  _setStatus: function Sync__setStatus(status) {
    document.getElementById("sync-menu-button").setAttribute("status", status);

    let label;
    if (status == "offline")
      label = this._stringBundle.getString("status.offline");
    else {
      let username = this._prefSvc.getCharPref("extensions.weave.username");
      if (!username || username == 'nobody@mozilla.com') {
        this._log.error("status is " + status + ", but username not set");
        // Fall back to a generic string.
        label = this._stringBundle.getString("status." + status);
      }
      else
        label = username;
    }
    document.getElementById("sync-menu-status").setAttribute("value", label);
  },

  _onLoginStart: function Sync__onLoginStart() {
    this._log.info("Logging in...");
    this._log.info("User string: " + navigator.userAgent);
    this._log.info("Weave version: " + Weave.WEAVE_VERSION);
    this._setStatus("active");
  },

  _onLoginError: function Sync__onLoginError() {
    this._setStatus("offline");

    let title = this._stringBundle.getString("error.login.title");
    let description =
    this._stringBundle.getString("error.login.description");
    let notification =
    new Weave.Notification(title,
                           description,
                           null,
                           Weave.Notifications.PRIORITY_WARNING);
    Weave.Notifications.add(notification);
  },

  _onLogin: function Sync__onLogin() {
    this._log.info("Login successful");
    this._setStatus("idle");

    this._userLogin = false;

    let loginitem = document.getElementById("sync-loginitem");
    let logoutitem = document.getElementById("sync-logoutitem");
    if(loginitem && logoutitem) {
      loginitem.setAttribute("hidden", "true");
      logoutitem.setAttribute("hidden", "false");
    }

    let syncnowitem = document.getElementById("sync-syncnowitem");
    if (syncnowitem)
      syncnowitem.setAttribute("disabled", "false");
  },

  _onLogout: function Sync__onLogout(status) {
    if (status)
      this._setStatus("offline");
    else {
      this._setStatus("idle");
      let title = this._stringBundle.getString("error.logout.title");
      let description =
        this._stringBundle.getString("error.logout.description");
      let notification =
        new Weave.Notification(title,
                               description,
                               null,
                               Weave.Notifications.PRIORITY_WARNING);
      Weave.Notifications.add(notification);
    }

    let loginitem = document.getElementById("sync-loginitem");
    let logoutitem = document.getElementById("sync-logoutitem");
    if(loginitem && logoutitem) {
      loginitem.setAttribute("hidden", "false");
      logoutitem.setAttribute("hidden", "true");
    }

    let syncnowitem = document.getElementById("sync-syncnowitem");
    if (syncnowitem)
      syncnowitem.setAttribute("disabled", "true");
  },

  _onSyncStart: function Sync_onSyncStart() {
    this._setStatus("active");

    let syncitem = document.getElementById("sync-syncnowitem");
    if(syncitem)
      syncitem.setAttribute("disabled", "true");

    let logoutitem = document.getElementById("sync-logoutitem");
    if(logoutitem)
      logoutitem.setAttribute("disabled", "true");
  },

  _onSyncEnd: function Sync_onSyncEnd(status) {
    this._setStatus("idle");

    if (!status &&
        Weave.FaultTolerance.Service.lastException != "Could not acquire lock") {
      let title = this._stringBundle.getString("error.sync.title");
      let description = this._stringBundle.getString("error.sync.description");
      let tryAgainButton =
        new Weave.NotificationButton(
          this._stringBundle.getString("error.sync.tryAgainButton.label"),
          this._stringBundle.getString("error.sync.tryAgainButton.accesskey"),
          function() { Weave.Service.sync(); return false; }
        );
      let notification =
        new Weave.Notification(
          title,
          description,
          null,
          Weave.Notifications.PRIORITY_WARNING,
          [tryAgainButton]
        );
      Weave.Notifications.add(notification);
    }

    let syncitem = document.getElementById("sync-syncnowitem");
    if (syncitem)
      syncitem.setAttribute("disabled", "false");

    let logoutitem = document.getElementById("sync-logoutitem");
    if(logoutitem)
      logoutitem.setAttribute("disabled", "false");

    if (this._isTopBrowserWindow)
      this._prefSvc.setCharPref("extensions.weave.lastsync",
                                new Date().getTime());
    this._updateLastSyncItem();
  },

  shutDown: function Sync_shutDown(event) {
    this._log.info("Sync window closed");

    this._os.removeObserver(this, "weave:service:login:start");
    this._os.removeObserver(this, "weave:service:login:success");
    this._os.removeObserver(this, "weave:service:login:error");
    this._os.removeObserver(this, "weave:service:logout:success");
    this._os.removeObserver(this, "weave:service:sync:start");
    this._os.removeObserver(this, "weave:service:sync:success");
    this._os.removeObserver(this, "weave:service:sync:error");
    this._os.removeObserver(this, "weave:notification:added");
    this._os.removeObserver(this, "weave:notification:removed");
    this._os.removeObserver(this, "weave:store:tabs:virtual:created");
    this._os.removeObserver(this, "weave:store:tabs:virtual:removed");
  },

  doLoginPopup : function Sync_doLoginPopup(event) {
    this._openWindow('Sync:Login', 'chrome://weave/content/login.xul');
  },

  doLogin: function Sync_doLogin(event) {
    if (Weave.Service.isInitialized)
      return; // already logged in

    let username = this._prefSvc.getCharPref("extensions.weave.username");

    if (!username || username == 'nobody') {
      this.doOpenSetupWizard();
      return;
    }

    this.doLoginPopup();
  },

  doOpenSetupWizard : function Sync_doOpenSetupWizard(event) {
      window.openDialog('chrome://weave/content/wizard.xul', '',
        'chrome,centerscreen,dialog,resizable=yes', null);
  },

  doLogout: function Sync_doLogout(event) {
    Weave.Service.logout();
  },

  doSync: function Sync_doSync(event) {
    this._openWindow('Sync:Status', 'chrome://weave/content/status.xul');
  },

  doShare: function Sync_doShare(event) {
    this._openWindow('Sync:Share', 'chrome://weave/content/share.xul');
  },

  doCancelSync: function Sync_doCancelSync(event) {
    this._log.error("cancel sync unimplemented");
  },

  doOpenPrefs: function Sync_doOpenPrefs(event) {
    openPreferences("sync-prefpane");
  },

  onOpenPrefs : function Sync_onOpenPrefs(event) {
    // XXX called when prefpane opens, setup password and login states
  },

  doOpenActivityLog: function Sync_doOpenActivityLog(event) {
    this._openWindow('Weave:Log', 'chrome://weave/content/log.xul',
                     'chrome, centerscreen, dialog, resizable=yes');
  },

  doPopup: function Sync_doPopup(event) {
    this._updateLastSyncItem();
  },

  // FIXME: refactor this function with the identical one in notification.xml.
  _getVirtualTabs: function Sync__getVirtualTabs() {
    let tabStore = Weave.Engines.get("tabs").store;
    let virtualTabs = tabStore.virtualTabs;

    // Convert the hash of virtual tabs indexed by ID into an array
    // of virtual tabs whose ID is stored in an ID property.
    virtualTabs =
      [(virtualTabs[id].id = id) && virtualTabs[id] for (id in virtualTabs)];

    // Remove invalid tabs.
    virtualTabs = virtualTabs.filter(tabStore.validateVirtualTab, tabStore);

    // Sort virtual tabs by their position in their windows.
    // Note: we don't actually group by window first, so all first tabs
    // will appear first in the list, followed by all second tabs, and so on.
    // FIXME: group by window, even though we aren't opening them up that way,
    // so the list better resembles the pattern the user remembers.
    virtualTabs.sort(function(a, b) a.position > b.position ?  1 :
                                    a.position < b.position ? -1 : 0);

    return virtualTabs;
  },

  doInitTabsMenu: function Sync_doInitTabsMenu() {
    let menu = document.getElementById("sync-tabs-menu");
    let virtualTabs = this._getVirtualTabs();

    while (menu.itemCount > 1)
      menu.removeItemAt(menu.itemCount - 1);

    for each (let virtualTab in virtualTabs) {
      let currentEntry = virtualTab.state.entries[virtualTab.state.index - 1];
      let label = currentEntry.title ? currentEntry.title : currentEntry.url;
      let menuitem = menu.appendItem(label, virtualTab.id);
      // Make a tooltip that contains either or both of the title and URL.
      menuitem.tooltipText =
        [currentEntry.title, currentEntry.url].filter(function(v) v).join("\n");
    }

    document.getElementById("sync-no-tabs-menu-item").hidden =
      (menu.itemCount > 1);
  },

  onCommandTabsMenu: function Sync_onCommandTabsMenu(event) {
    let tabID = event.target.value;
    let virtualTabs = Weave.Engines.get("tabs").store.virtualTabs;
    let virtualTab = virtualTabs[tabID];

    let tab = gBrowser.addTab("about:blank");
    this._sessionStore.setTabState(tab, this._json.encode(virtualTab.state));
    gBrowser.selectedTab = tab;
    delete virtualTabs[tabID];

    // FIXME: update a notification that lists the opened tab, if any.
  },

  _onNotificationAdded: function Sync__onNotificationAdded() {
    document.getElementById("sync-notifications-button").hidden = false;
  },

  _onNotificationRemoved: function Sync__onNotificationRemoved() {
    if (Weave.Notifications.notifications.length == 0)
      document.getElementById("sync-notifications-button").hidden = true;
  },

  _onVirtualTabsChanged: function Sync__onVirtualTabsChanged() {
    let virtualTabs = this._getVirtualTabs();

    // Get the (first, which should also be the only) notification, if any.
    let [existingNotification] =
      Weave.Notifications.notifications.
      filter(function(v) v.constructor.name == "TabsNotification");

    // As long as there is at least one virtual tab that hasn't previously been
    // disposed of by the user, notify the user about available tabs.
    for each (let virtualTab in virtualTabs) {
      if (!virtualTab._disposed) {
        // If there's an existing tabs notification, update it.
        // FIXME: make tabs notifications automatically update themselves.
        let newNotification = new Weave.TabsNotification();
        if (existingNotification)
          Weave.Notifications.replace(existingNotification, newNotification);
        else
          Weave.Notifications.add(newNotification);

        return;
      }
    }

    // If we've gotten this far, it means there are no tabs left to notify
    // the user about, so remove the existing notification, if any.
    if (existingNotification)
      Weave.Notifications.remove(existingNotification);
  },

  _updateLastSyncItem: function Sync__updateLastSyncItem() {
    let lastSync = this._prefSvc.getCharPref("extensions.weave.lastsync");
    if (!lastSync)
      return;

    let lastSyncItem = document.getElementById("sync-lastsyncitem");
    if (!lastSyncItem)
      return;

    let lastSyncDate = new Date(parseInt(lastSync)).toLocaleString();
    let lastSyncLabel =
      this._stringBundle.getFormattedString("lastSync.label", [lastSyncDate]);
    lastSyncItem.setAttribute("label", lastSyncLabel);
    lastSyncItem.setAttribute("hidden", "false");
  },

  onMenuPopupHiding: function Sync_onMenuPopupHiding() {
    var menuPopup = document.getElementById('sync-menu-popup');
    var menu = document.getElementById('sync-menu');

    // If the menu popup isn't on the Tools > Sync menu, then move the popup
    // back onto that menu so the popup appears when the user selects the menu.
    // We'll move the popup back to the menu button when the user clicks on
    // the menu button.
    if (menuPopup.parentNode != menu)
      menu.appendChild(menuPopup);
  },

  onMenuButtonMouseDown: function Sync_onMenuButtonMouseDown() {
    var menuPopup = document.getElementById('sync-menu-popup');
    var menuButton = document.getElementById("sync-menu-button");

    // If the menu popup isn't on the menu button, then move the popup onto
    // the button so the popup appears when the user clicks the button.  We'll
    // move the popup back to the Tools > Sync menu when the popup hides.
    if (menuPopup.parentNode != menuButton)
      menuButton.appendChild(menuPopup);
  },

  // nsIObserver
  observe: function(subject, topic, data) {
    switch(topic) {
    case "weave:service:login:start":
      this._onLoginStart();
      break;
    case "weave:service:login:success":
      this._onLogin();
      break;
    case "weave:service:login:error":
      this._onLoginError();
      break;
    case "weave:service:logout:success":
      this._onLogout(true);
      break;
    case "weave:service:sync:start":
      this._onSyncStart();
      break;
    case "weave:service:sync:success":
      this._onSyncEnd(true);
      break;
    case "weave:service:sync:error":
      this._onSyncEnd(false);
      break;
    case "weave:notification:added":
      this._onNotificationAdded();
      break;
    case "weave:notification:removed":
      this._onNotificationRemoved();
      break;
    case "weave:store:tabs:virtual:created":
      this._onVirtualTabsChanged();
      break;
    case "weave:store:tabs:virtual:removed":
      this._onVirtualTabsChanged();
      break;
    default:
      this._log.warn("Unknown observer notification topic: " + topic);
      break;
    }
  }
};

let gSync;

window.addEventListener("load", function(e) { gSync = new Sync(); }, false);
window.addEventListener("unload", function(e) { gSync.shutDown(e); }, false);
