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
 * The Original Code is Bookmarks sync code.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Jono DiCarlo <jdicarlo@mozilla.com>
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

const EXPORTED_SYMBOLS = ['gFennecWeaveGlue'];

function FennecWeaveGlue() {
  // Yes, Log4Moz works fine on fennec.
  this._log = Log4Moz.repository.getLogger("Chrome.Window");
  //this._pfs.addObserver("", this, false);
  this._os.addObserver(this, "weave:service:sync:start", false);
  this._os.addObserver(this, "weave:service:sync:finish", false);
  this._os.addObserver(this, "weave:service:sync:error", false);

  try {
    Cu.import("resource://weave/util.js");

    Cu.import("resource://weave/engines/bookmarks.js");
    Weave.Engines.register(new BookmarksEngine());

    Cu.import("resource://weave/engines/history.js");
    Weave.Engines.register(new HistoryEngine());

    Cu.import("resource://weave/engines/tabs.js");
    Weave.Engines.register(new TabEngine());

  } catch (e) {
    dump("Could not initialize engine!\n");
    dump("The error is: " + (e.message? e.message: e) + "\n");
    this._log.error("Could not initialize engine: " + (e.message? e.message : e));
  }

  /* Generating keypairs is an expensive operation, and we should never
   have to do it on Fennec because we don't support creating a Weave
   account from Fennec (yet). */
  Weave.Service.keyGenEnabled = false;

  /* Figure out what weave's status is, and set the status message
   * appropriately:
   */
  if (this._pfs.getBoolPref("extensions.weave.enabled")) {
    this.setWeaveStatusField("Weave is trying to log in...");
    /* startup Weave service after a delay, so that it will happen after the
     * UI is loaded. */
    let self = this;
    setTimeout( function() {
		  self._log.info("Timeout done, starting Weave service.\n");
		  Weave.Service.onStartup( function() {
					     self.showLoginStatus();
					   });
		}, 3000);
  } else {
    this.setWeaveStatusField("Weave is turned off.");
    // If it's turned off, don't start it up.
  }
}
FennecWeaveGlue.prototype = {
  __prefService: null,
  get _pfs() {
    if (!this.__prefService) {
      this.__prefService = Cc["@mozilla.org/preferences-service;1"]
      .getService(Ci.nsIPrefBranch);
    }
    return this.__prefService;
  },

  __os: null,
  get _os() {
    if (!this.__os)
      this.__os = Cc["@mozilla.org/observer-service;1"]
        .getService(Ci.nsIObserverService);
    return this.__os;
  },

  _passwordsHidden: false,

  shutdown: function FennecWeaveGlue__shutdown() {
    // Anything that needs shutting down can go here.
    this._os.removeObserver(this, "weave:service:sync:start");
    this._os.removeObserver(this, "weave:service:sync:finish");
    this._os.removeObserver(this, "weave:service:sync:error");
  },

  observe: function FennecWeaveGlue__observe(subject, topic, data) {
    // observe for "sync", "foo-engine:sync", and...
    // weave:service:sync:start
    // Event: weave:service:sync:finish

    switch (topic) {
      /*case "nsPref:changed":
        switch (data) {
          case "extensions.weave.enabled":
	  if (this._pfs.getBoolPref("extensions.weave.enabled")) {
	    this._turnWeaveOn();
	  } else {
	    this._turnWeaveOff();
	  }
            break;
        }
        break;*/
      case "weave:service:sync:start":
	this.setWeaveStatusField("Syncing Now!");
      break;
      case "weave:service:sync:finish":
	this.setWeaveStatusField("Sync completed successfully!");
      break;
      case "weave:service:sync:finish":
	this.setWeaveStatusField("Hit an error while syncing!");
      break;
    }
  },

  showHidePasswordFields: function FennecWeaveGlue__showHidePassFields() {
    var passwordField = document.getElementById("password-input");
    var passphraseField = document.getElementById("passphrase-input");
    var lockIcon = document.getElementById("hide-password-button");

    this._passwordsHidden = !this._passwordsHidden;
    if (this._passwordsHidden) {
      passwordField.type = "password";
      passphraseField.type = "password";
      lockIcon.src="chrome://weave/skin/lock-closed.png";
    } else {
      passwordField.type = "";
      passphraseField.type = "";
      lockIcon.src="chrome://weave/skin/lock-open.png";
    }
  },

  openConnectPane: function FennecWeaveGlue__openConnectPane() {
    var username = this._pfs.getCharPref("extensions.weave.username");
    var password = Weave.Service.password;
    var passphrase = Weave.Service.passphrase;

    BrowserUI.switchPane("weave-detail-connect-pane");
    if (username && username != "nobody") {
      document.getElementById("username-input").value = username;
    } else {
      document.getElementById("username-input").value = "Your Username Here";
    }
    if (password) {
      document.getElementById("password-input").value = password;
    } else {
      document.getElementById("password-input").value = "Your Password Here";
    }
    if (passphrase) {
      document.getElementById("passphrase-input").value = passphrase;
    } else {
      document.getElementById("passphrase-input").value = "Your Passphrase Here";
    }
  },

  openPrefsPane: function FennecWeaveGlue__openPrefsPane() {
    BrowserUI.switchPane("weave-detail-prefs-pane");
    var username = this._pfs.getCharPref("extensions.weave.username");
    var theButton = document.getElementById("weave-on-off-button");
    if (this._pfs.getBoolPref("extensions.weave.enabled")) {
      theButton.label = "Turn Weave Off";
    } else {
      theButton.label = "Turn Weave On";
    }
    document.getElementById("username-label").value = "You are user: " + username;
  },

  openWeavePane: function FennecWeaveGlue__openWeavePane() {
    /* Looks at whether username/password/
     * passphrase are set and uses that to determine whether setup is
     * required; opens connect pane if setup is required, prefs pane
     * if not.*/

    // this works with the prefs stuff defined in the overlay to
    // deck id="panel-items" in fennec-preferences.xul.
    var username = this._pfs.getCharPref("extensions.weave.username");
    var password = Weave.Service.password;
    var passphrase = Weave.Service.passphrase;

    if ( username && password && passphrase && username != "nobody") {
      this.openPrefsPane();
    } else {
      this.openConnectPane();
    }
  },
    /*Also: defaults for prefs being different on fennec than on ffox?
       E.G. rememberpassword default to true, syncOnQuit default to false
       (but syncOnStart default to true...)  Pref defaults can be set
     programmatically (not affecting the actual current setting)
     with something like:
     defaults = this._prefSvc.getDefaultBranch(null);
     defaults.setCharPref(name, val);*/


  submitConnectForm: function FennecWeaveGlue__submitConnect(errFieldId) {
    this._log.info("connection form submitted...");

    var usernameInput = document.getElementById("username-input").value;
    var passwordInput = document.getElementById("password-input").value;
    var passphraseInput = document.getElementById("passphrase-input").value;
    var errField = document.getElementById(errFieldId);
    if (usernameInput == "") {
      errField.value = "You must enter a Weave username.";
      return;
    }
    if (passwordInput == "") {
      errField.value = "You must enter a Weave password.";
      return;
    }
    if (passphraseInput == "") {
      errField.value = "You must enter a Weave passphrase.";
      return;
    }

    this._turnWeaveOff();

    this._pfs.setCharPref("extensions.weave.username", usernameInput);
    Weave.Service.password = passwordInput;
    Weave.Service.passphrase = passphraseInput;

    // redirect you to the full prefs page if login succeeds.
    var self = this;
    this._turnWeaveOn( function() {
			 self.openPrefsPane();
		       });
  },

  _turnWeaveOff: function FennecWeaveGlue__turnWeaveOff() {
    this._log.info("Turning Weave off...");
    if (Weave.Service.isLoggedIn) {
      Weave.Service.logout();
    }
    this.setWeaveStatusField("Weave is turned off.");
  },

  _turnWeaveOn: function FennecWeaveGlue__turnWeaveOn( onSuccess ) {
    // onSuccess is an optional callback function that gets called
    // when login completes successfully.
    this._log.info("Turning Weave on...");
    var log = this._log;
    var setStatus = this.setWeaveStatusField;
    setStatus("Weave is logging in...");
    if (!Weave.Service.isLoggedIn) {
      try {
	// Report on success or failure...
        Weave.Service.login( function(success) {
			       if (success) {
				 setStatus("Weave is logged in.");
				 if (onSuccess) {
				   onSuccess();
				 }
			       } else {
				 // TODO nothing gets displayed on the
				 // connect page if a problem happens here.
				 setStatus("Weave had an error when trying to log in.");
			       }
			     } );
      } catch(e) {
	log.warn("Exception caught when logging in: " + e);
	setStatus("Weave had an error when trying to log in.");
	// TODO more specific message based on what the error is.
	// e.g. Original exception: No server URL set
      }
    }
  },

  selectField: function FennecWeaveGlue__selectField(id) {
    var field = document.getElementById(id);
    field.focus();
    field.select();
  },

  showLoginStatus: function FennecWeaveGlue__updateStatusMessage() {
    if (Weave.Service.isLoggedIn) {
      this.setWeaveStatusField("Weave is logged in and idle.");
    } else {
      // Not logged in?  Why not?
      var pass = Weave.Service.password;
      var phrase = Weave.Service.passphrase;
      var user = this._pfs.getCharPref("extensions.weave.username");
      if (!pass || pass == "" || !user || user == "" || !phrase || phrase == "") {
	this.setWeaveStatusField("Weave needs more info from you to get started.");
      } else {
	// TODO display more specifics depending on what the error was
	this.setWeaveStatusField("Weave encountered an error when trying to log you in.");
      }
    }
  },

  setWeaveStatusField: function FennecWeaveGlue__setWeaveStatusField(text) {
    var elem = document.getElementById("fennec-weave-quick-status");
    if (elem) {
      elem.value = text;
    }
    var elem2 = document.getElementById("fennec-weave-full-status");
    if (elem2) {
      elem2.value = text;
    }
  },

  toggleWeaveOnOff: function FennecWeaveGlue_toggleWeave() {
    var theButton = document.getElementById("weave-on-off-button");
    if (this._pfs.getBoolPref("extensions.weave.enabled")) {
      this._pfs.setBoolPref("extensions.weave.enabled", false);
      this._turnWeaveOff();
      theButton.label = "Turn Weave On";
    } else {
      this._pfs.setBoolPref("extensions.weave.enabled", true);
      theButton.label = "Turning Weave On...";
      theButton.enabled = false;
      this._turnWeaveOn( function() {
			   theButton.enabled = true;
			   theButton.label = "Turn Weave Off";
			 });
    }
  },

  syncNow: function FennecWeaveGlue_syncNow() {
    if (Weave.Service.isLoggedIn) {
      if (!Weave.Service.isQuitting) {
	Weave.Service.sync();
      } else {
	dump("Can't sync, Weave is quitting.");
      }
    } else {
      dump("Can't sync, Weave is not logged in.");
    }
  },

  showSyncedTabs: function FennecWeaveGlue_showSyncedTabs() {
    RemoteTabViewer.show();
  },

  hideSyncedTabs: function FennecWeaveGlue_hideSyncedTabs() {
    RemoteTabViewer.close();
  }
};

var RemoteTabViewer = {
  _panel: null,
  _remoteClients: null,

  show: function() {
    let container = document.getElementById("browser-container");
    this._panel = document.getElementById("synced-tabs-panel");
    this._panel.hidden = false;
    this._panel.width = container.boxObject.width;
    this._panel.height = container.boxObject.height;
    /*  If we want the tab bar to still appear on the right side:
     *     let width = tabContainer.boxObject.width;
     * tabContainer.left = container.boxObject.width - width;
     * syncedTabPanel.hidden = false;
     * syncedTabPanel.width = container.boxObject.width - width;
     */
    let tabEngine = Weave.Engines.get("tabs");
    this._remoteClients = tabEngine.getAllClients();
    this._populateTabs(document.getElementById("remote-tabs-richlist"));
  },

  close: function() {
    this._panel.hidden = true;
  },

  _populateTabs: function FennecWeaveGlue_loadRemoteTabs(holder) {
    /* Clear out all child elements from holder first, so we don't
     * end up adding duplicate columns: */
    while (holder.firstChild) {
      holder.removeChild(holder.firstChild);
    }

    // Load up all of the remote tabs we can find, into the richlist:
    for each (let record in this._remoteClients) {
      /*let newGroupbox = document.createElement("groupbox");
      holder.appendChild(newGroupbox);
      let newCaption = document.createElement("caption");
      let labelText = "Tabs From " + record.getClientName();
      newCaption.setAttribute("label", labelText);
      newGroupbox.appendChild(newCaption);*/
      // See definition of richlistbox class = "tab-list" in fennec's tabs.xml
      // and richlistitem type="remotetab" in weave's tabs.xml
     /* let newRichList = document.createElement("richlistbox");
      newRichList.setAttribute("class", "tab-list");
      newRichList.tabsPerColumn = 12;
      newRichList.addEventListener("select", function(event) {
				     RemoteTabViewer.openSyncedTab(this, event);
				   }, "true");
      newGroupbox.appendChild(newRichList);*/
      let newRichList = holder;
      newRichList.tabsPerColumn = 100;
      let tabs = record.getAllTabs();
      for each (let tab in tabs) {
	let newThingy = document.createElement("richlistitem");
	newThingy.setAttribute("type", "remotetab");
	newRichList.addTab(newThingy);
	let domain = Utils.makeURI(tab.urlHistory[0]).prePath;
	let favicon = domain + "/favicon.ico";
	newThingy.updatePreview(tab.title, favicon);
	newThingy.setTabData(tab);
      }
    }
    // TODO: the close button can be pushed offscreen by too long a list of
    // tabs.  Fix that!
  },

  openSyncedTab: function FennecWeaveGlue_openSyncedTab(richlist, event) {
    let tabData = richlist.selectedItem.getTabData();
    this.close();
    try {
      // Newer versions of fennec do it this way:
      Browser.addTab(tabData.urlHistory[0], true);
    } catch (e) {
      // Older versions do it this way:
      Browser.newTab(true);
      BrowserUI.goToURI(tabData.urlHistory[0]);
    }
  }
};

let gFennecWeaveGlue;
window.addEventListener("load", function(e) {
			  gFennecWeaveGlue = new FennecWeaveGlue();
			}, false );
window.addEventListener("unload", function(e) {
			  gFennecWeaveGlue.shutdown(e);
			}, false );
