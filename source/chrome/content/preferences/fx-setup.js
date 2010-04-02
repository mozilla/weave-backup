const Ci = Components.interfaces;
const Cc = Components.classes;
const Cr = Components.results;

var gWeaveSetup = {
  get _usingMainServers() {
    return document.getElementById("serverType").selectedItem.value == "main";
  },

  status: { username: false, password: false, email: false, server: false},

  get captchaBrowser() {
    delete this.captchaBrowser;
    return this.captchaBrowser =document.getElementById("captcha");
  },

  get bundle() {
    delete this.bundle;
    return this.bundle = document.getElementById("weavePrefStrings");
  },

  get wizard() {
    delete this.wizard;
    return this.wizard = document.getElementById("accountSetup");
  },

  init: function () {
    this.wizard.canAdvance = false;
    this.wizard.getButton("finish").label = this.bundle.getString("startSyncing.label");
    this.onServerChange();
    this.captchaBrowser.addProgressListener(this);
  },

  updateSyncPrefs: function () {
    let syncEverything = document.getElementById("weaveSyncMode").selectedItem.value == "syncEverything";
    document.getElementById("syncModeOptions").selectedIndex = syncEverything ? 0 : 1;

    if (syncEverything) {
      document.getElementById("engine.bookmarks").checked = true;
      document.getElementById("engine.passwords").checked = true;
      document.getElementById("engine.history").checked   = true;
      document.getElementById("engine.tabs").checked      = true;
      document.getElementById("engine.prefs").checked     = true;
    }
  },

  // fun with validation!
  checkFields: function () {
    this.wizard.canAdvance = this.readyToAdvance();
  },

  readyToAdvance: function () {
    switch (this.wizard.currentPage.pageIndex) {
      case 0: // first page
        for (i in this.status) {
          if (!this.status[i])
            return false;
        }
        if (this._usingMainServers)
          return document.getElementById("tos").checked;

        return true;
      case 1:
        return true;
      case 2:
        return this.onPassphraseChange();
    }
    throw "epic fail, we should never get here";
  },

  onUsernameChange: function () {
    let feedback = document.getElementById("usernameFeedbackRow");
    let val = document.getElementById("weaveUsername").value
    let available = val == "" || Weave.Service.checkUsername(val) == "available";

    let str = available ? "" : "usernameNotAvailable.label";
    this._setFeedbackMessage(feedback, available, str);

    this.status.username = available;
    this.checkFields();
  },

  onPasswordChange: function () {
    let valid = true;
    let feedback = document.getElementById("passwordFeedbackRow");

    let password = document.getElementById("weavePassword").value;
    if (password.length < Weave.MIN_PASS_LENGTH) {
      valid = false;
      this._setFeedbackMessage(feedback, valid, "passwordTooWeak.label");
    }

    let pwconfirm = document.getElementById("weavePasswordConfirm").value;
    if (valid && pwconfirm && password != pwconfirm) {
      valid = false;
      this._setFeedbackMessage(feedback, valid, "passwordMismatch.label");
    }

    if (valid && pwconfirm)
      this._setFeedbackMessage(feedback, valid);

    this.status.password = valid;
    this.checkFields();
  },

  onEmailChange: function () {
    let re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    this.status.email = re.test(document.getElementById("weaveEmail").value);

    this._setFeedbackMessage(document.getElementById("emailFeedbackRow"),
                             this.status.email,
                             "invalidEmail.label");

    this.checkFields();
  },

  onPassphraseChange: function () {
    // state values: 0 = valid, 1 = invalid, no warn, 2 = invalid, warn
    let state = 0;
    let str = null;
    let val = document.getElementById("weavePassphrase").value;
    let valConfirm = document.getElementById("weavePassphraseConfirm").value;

    if (val == document.getElementById("weavePassword").value) {
      str = "cannotMatchPassword.label";
      state = 2;
    }

    if (state == 0 && (val.length < Weave.MIN_PP_LENGTH || valConfirm.length < val.length))
      state = 1;

    if (state == 0 && val != valConfirm) {
      str = "entriesMustMatch.label";
      state = 2;
    }

    let feedback = document.getElementById("passphraseFeedbackRow");
    let success = state != 2;
    this._setFeedbackMessage(feedback, success, str);
    return state == 0;
  },

  openToS: function () {
    let url = Weave.Svc.Prefs.get("termsURL");
    openUILinkIn(url, "tab");
  },

  onPageShow: function() {
    switch (this.wizard.currentPage.pageIndex) {
      case 2:
        this.wizard.canRewind = false;
        this.wizard.canAdvance = false;
        break;
    }
  },

  onWizardAdvance: function () {
    if (!this.wizard.currentPage)
      return true;

    switch (this.wizard.currentPage.pageIndex) {
      case 0:
        // time to load the captcha
        // first check for NoScript and whitelist the right sites
        this._handleNoScript(true);
        this.captchaBrowser.loadURI(Weave.Service.miscAPI + "captcha_html");
        break;
      case 1:
        let doc = this.captchaBrowser.contentDocument;
        let getField = function getField(field) {
          let node = doc.getElementById("recaptcha_" + field + "_field");
          return node && node.value;
        };

        this.startThrobber(true);
        let username = document.getElementById("weaveUsername").value;
        let password = document.getElementById("weavePassword").value;
        let email    = document.getElementById("weaveEmail").value;
        let challenge = getField("challenge");
        let response = getField("response");

        let error = Weave.Service.createAccount(username, password, email,
                                                challenge, response);
        this.startThrobber(false);

        if (error == null) {
          Weave.Service.username = username;
          Weave.Service.password = password;
          Weave.Service.persistLogin();
          this._handleNoScript(false);
          return true;
        }

        // this could be nicer, but it'll do for now
        Weave.Svc.Prompt.alert(window,
                               this.bundle.getString("errorCreatingAccount.title"),
                               Weave.Utils.getErrorString(error));
        return false;
      case 2:
        Weave.Service.passphrase = document.getElementById("weavePassphrase").value;
        Weave.Service.persistLogin();
        break;
    }
    return true;
  },

  onWizardFinish: function () {
    function isChecked(element) {
      return document.getElementById(element).hasAttribute("checked");
    }

    let prefs = ["engine.bookmarks", "engine.passwords", "engine.history", "engine.tabs", "engine.prefs"];
    for (let i = 0;i < prefs.length;i++) {
      Weave.Svc.Prefs.set(prefs[i], isChecked(prefs[i]));
    }

    window.opener.close();
    Weave.Svc.Prefs.reset("firstSync");
    Weave.Service.login();
  },

  onWizardCancel: function () {
    this._handleNoScript(false);
  },

  _disabledSites: [],
  get _remoteSites() {
    return [Weave.Service.serverURL, "https://api-secure.recaptcha.net"];
  },

  _handleNoScript: function (addExceptions) {
    // if NoScript isn't installed, or is disabled, bail out.
    let nsExt = Application.extensions.get("{73a6fe31-595d-460b-a920-fcc0f8843232}");
    if (!nsExt || !nsExt.enabled)
      return;

    let ns = Cc["@maone.net/noscript-service;1"].getService().wrappedJSObject;
    if (addExceptions) {
      this._remoteSites.forEach(function(site) {
        site = ns.getSite(site);
        if (!ns.isJSEnabled(site)) {
          this._disabledSites.push(site); // save status
          ns.setJSEnabled(site, true); // allow site
        }
      }, this);
    }
    else {
      this._disabledSites.forEach(function(site) {
        ns.setJSEnabled(site, false);
      });
      this._disabledSites = [];
    }
  },

  startThrobber: function (start) {
    // FIXME: stubbed
  },

  onServerChange: function () {
    document.getElementById("serverRow").hidden = this._usingMainServers;
    document.getElementById("TOSRow").hidden = !this._usingMainServers;
    let valid = false;
    let feedback = document.getElementById("serverFeedbackRow");

    if (this._usingMainServers) {
      Weave.Svc.Prefs.reset("serverURL");
      valid = true;
      feedback.hidden = true;
    }
    else {
      let urlString = document.getElementById("weaveServerURL").value;
      let str = "";
      if (urlString) {
        let uri = Weave.Utils.makeURI(urlString);
        if (uri) {
          Weave.Service.serverURL = uri.spec;
          valid = true;
        }

        str = valid ? "" : "serverInvalid.label";
        this._setFeedbackMessage(feedback, valid, str);
      }
      else
        this._setFeedbackMessage(feedback, true);

    }

    // belt and suspenders-ish
    if (!valid)
      Weave.Svc.Prefs.reset("serverURL");

    this.status.server = valid;
    this.checkFields();
  },

  // sets class and string on a feedback element
  // if no property string is passed in, we clear label/style
  _setFeedbackMessage: function (element, success, string) {
    element.hidden = success;
    let label = element.firstChild.nextSibling;
    label.className = success ? "success" : "error";
    let str = "", classname = "";
    if (string) {
      str = this.bundle.getString(string);
      classname = success ? "success" : "error";
    }
    label.value = str;
    label.className = classname;
  },

  QueryInterface: function (aIID) {
    if (aIID.equals(Ci.nsIWebProgressListener) ||
        aIID.equals(Ci.nsISupportsWeakReference) ||
        aIID.equals(Ci.nsISupports))
      return this;
    throw Cr.NS_NOINTERFACE;
  },

  onStateChange: function(webProgress, request, stateFlags, status) {
    // We're only looking for the end of the frame load
    if ((stateFlags & Ci.nsIWebProgressListener.STATE_STOP) == 0)
      return;
    if ((stateFlags & Ci.nsIWebProgressListener.STATE_IS_NETWORK) == 0)
      return;
    if ((stateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW) == 0)
      return;

    // If we didn't find the captcha, assume it's not needed and move on
    if (request.QueryInterface(Ci.nsIHttpChannel).responseStatus == 404)
      this.onWizardAdvance();
  },
  onProgressChange: function() {},
  onStatusChange: function() {},
  onSecurityChange: function() {},
  onLocationChange: function () {}
}
