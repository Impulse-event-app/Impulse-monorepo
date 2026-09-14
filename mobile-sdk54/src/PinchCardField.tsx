// PinchCardField — card entry + client-side tokenisation via Pinch CaptureJs.
//
// CaptureJs is a browser-only script, so the card form lives inside a WebView.
// Raw card details never leave the WebView: CaptureJs tokenises them and only
// the resulting token (tkn_XXX) is posted back to React Native, which sends it
// to our server. Docs: https://docs.getpinch.com.au/docs/capturejs-tokenisation

import { useMemo } from 'react';
import { WebView } from 'react-native-webview';

const CAPTUREJS_SRC = 'https://cdn.getpinch.com.au/capturejs/pinch.capture.v2.js';
const CAPTUREJS_INTEGRITY = 'sha384-hglYFSKC4AMA/rAQOGB3OiA8u5ri5F4qNMGgw4I+fggDSlTmPyREcj1J+VGnkAX8';

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_PINCH_PUBLISHABLE_KEY ?? '';

export type PinchTokenResult = { token: string; cardHolderName: string };

export type PinchColors = {
  bg: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  surface: string;
  /** input fill (brand v2 quiet control fill); falls back to surface */
  fill?: string;
};

type Props = {
  /** A money amount (e.g. "$4.90") reads "Pay $4.90 deposit"; any other text is used as-is. */
  depositLabel: string;
  colors: PinchColors;
  onToken: (result: PinchTokenResult) => void;
  onError: (message: string) => void;
};

export function payButtonLabel(depositLabel: string) {
  return depositLabel.trim().startsWith('$') ? `Pay ${depositLabel} deposit` : depositLabel;
}

function buildHtml(depositLabel: string, c: PinchColors): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<script src="${CAPTUREJS_SRC}" integrity="${CAPTUREJS_INTEGRITY}" crossorigin="anonymous"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { background: transparent; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, Roboto, sans-serif;
         -webkit-font-smoothing: antialiased; padding: 2px; }
  label { display: block; font-size: 13px; letter-spacing: -0.05px; color: ${c.muted}; margin: 14px 4px 7px; }
  label:first-child { margin-top: 0; }
  input { width: 100%; height: 52px; padding: 0 14px; font: inherit; font-size: 17px; letter-spacing: -0.2px;
          font-variant-numeric: tabular-nums; color: ${c.text}; background: ${c.fill ?? c.surface};
          border: 1px solid transparent; border-radius: 10px; outline: none; -webkit-appearance: none; }
  input::placeholder { color: ${c.muted}; opacity: 0.7; }
  input:focus { border-color: ${c.accent}; }
  .row { display: flex; gap: 8px; }
  .row > div { flex: 1; min-width: 0; }
  button { width: 100%; height: 52px; margin-top: 20px; font: inherit; font-size: 17px; font-weight: 500; letter-spacing: -0.2px;
           font-variant-numeric: tabular-nums; color: #fff; background: ${c.accent}; border: none; border-radius: 26px;
           transition: transform .15s cubic-bezier(.32,.72,0,1); }
  button:active { transform: scale(.985); filter: brightness(.9); }
  button:disabled { opacity: 0.35; }
  #err { color: ${c.accent}; font-size: 15px; line-height: 21px; margin: 10px 4px 0; min-height: 16px; }
</style>
</head>
<body>
  <label>Name on card</label>
  <input id="cardHolderName" autocomplete="cc-name" placeholder="Jordan Lee">
  <label>Card number</label>
  <input id="cardNumber" inputmode="numeric" autocomplete="cc-number" placeholder="4111 1111 1111 1111">
  <div class="row">
    <div>
      <label>Month</label>
      <input id="expiryMonth" inputmode="numeric" autocomplete="cc-exp-month" placeholder="MM" maxlength="2">
    </div>
    <div>
      <label>Year</label>
      <input id="expiryYear" inputmode="numeric" autocomplete="cc-exp-year" placeholder="YYYY" maxlength="4">
    </div>
    <div>
      <label>CVC</label>
      <input id="cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4">
    </div>
  </div>
  <button id="pay">${payButtonLabel(depositLabel)}</button>
  <div id="err"></div>
<script>
  var post = function (msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); };
  var btn = document.getElementById('pay');
  var err = document.getElementById('err');
  var val = function (id) { return document.getElementById(id).value.trim(); };

  btn.addEventListener('click', function () {
    err.textContent = '';
    if (typeof Pinch === 'undefined') {
      post({ type: 'error', message: 'Payment library failed to load. Check your connection.' });
      return;
    }
    btn.disabled = true;
    var capture = Pinch.Capture({ publishableKey: '${PUBLISHABLE_KEY}' });
    capture.createToken({
      sourceType: 'credit-card',
      cardNumber: val('cardNumber').replace(/\\s+/g, ''),
      expiryMonth: val('expiryMonth'),
      expiryYear: val('expiryYear'),
      cvc: val('cvc'),
      cardHolderName: val('cardHolderName')
    }).then(function (result) {
      if (result && result.token) {
        post({ type: 'token', token: result.token, cardHolderName: val('cardHolderName') });
      } else {
        btn.disabled = false;
        var msg = (result && result.errors && JSON.stringify(result.errors)) || 'Card could not be verified.';
        err.textContent = msg;
        post({ type: 'error', message: msg });
      }
    }).catch(function (e) {
      btn.disabled = false;
      // CaptureJs rejects with { hasError, errors } where errors is Pinch's
      // response body — surface the real message.
      var msg = 'Card could not be verified.';
      if (e && e.message) { msg = e.message; }
      else if (e && e.errors) {
        try {
          var parsed = typeof e.errors === 'string' ? JSON.parse(e.errors) : e.errors;
          var msgs = (parsed || []).map(function (x) { return x && x.errorMessage; }).filter(Boolean);
          if (msgs.length) { msg = msgs.join(' '); }
        } catch (_) { if (typeof e.errors === 'string') { msg = e.errors; } }
      }
      err.textContent = msg;
      post({ type: 'error', message: msg });
    });
  });
</script>
</body>
</html>`;
}

export function PinchCardField({ depositLabel, colors, onToken, onError }: Props) {
  // Key on the colour values, not the object identity, so a re-render with an
  // equal palette doesn't reload the WebView and wipe what the user typed.
  const colorKey = JSON.stringify(colors);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildHtml(depositLabel, colors), [depositLabel, colorKey]);

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://app.impulse.local' }}
      style={{ height: 380, backgroundColor: 'transparent' }}
      containerStyle={{ backgroundColor: 'transparent' }}
      scrollEnabled={false}
      javaScriptEnabled
      onMessage={(event) => {
        try {
          const msg = JSON.parse(event.nativeEvent.data);
          if (msg.type === 'token') onToken({ token: msg.token, cardHolderName: msg.cardHolderName });
          else if (msg.type === 'error') onError(String(msg.message ?? 'Payment error'));
        } catch {
          onError('Payment error');
        }
      }}
    />
  );
}
