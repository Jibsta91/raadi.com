# 0025 — Push notifications: Expo's push service behind the notifications queue, a local mock offline

- Status: Accepted
- Date: 2026-10-04

## Context

The app (ADR-0021) shows new messages live while it is open, but people miss them when it is closed.
ADR-0017 planned push as "another channel of the same queue". iPhones and Android phones only accept pushes
through Apple's and Google's services. An Expo app (in Expo Go or a development build) gets an
**Expo push token** and is reached through Expo's push service, which forwards to APNs and FCM.

## Decision

- **Devices.** After sign-in the app asks for permission once, gets its Expo push token and registers it with
  `PUT /api/v1/notifications/devices` (token, platform). Registration repeats on every start. A token
  belongs to one user at a time: when someone else signs in on the same phone, the token moves to them. On
  sign-out the app removes its token (`DELETE /api/v1/notifications/devices/{token}`) while its session still
  works, through a new "before sign-out" hook in the auth provider. The web build (`/m`) has no push.
- **Queue.** The consumer queues a push in the same transaction as the e-mail and the in-app notice, and only
  when the user has a device. A sender loop claims due pushes with the same lease and backoff as e-mails
  (`FOR UPDATE SKIP LOCKED`, 30 s → 1 h, `PUSH_MAX_ATTEMPTS`). Pushes go first in each round because they are
  time-sensitive. A failing push service never stalls events or e-mail.
- **Triggers.** A new message (at most one per conversation every `PUSH_THROTTLE_SECONDS`, default 60, and
  only with `pushMessages` on); a listing removed by a moderator; a review received; a listing promoted.
  The last three mirror the in-app notices and cannot be muted, like service e-mails.
- **Content.** The text is localised at send time (language from Keycloak, like e-mail) and is discreet,
  because lock screens are public: no message text, no listing titles, no names. `data.url` is an app path
  (`/messages/<id>`, `/my-listings`, …). The app follows only plain in-app paths (`safeAppPath`), so a
  forged push cannot send anyone outside the app.
- **Uninstalled apps.** A `DeviceNotRegistered` ticket deletes the token. Other per-message errors are
  logged, and the push counts as sent to the other devices.
- **Transport.** `PUSH_URL` is Expo's API (`https://exp.host/--/api/v2/push/send`) in production. An
  optional `push_access_token` from OpenBao covers Expo's "enhanced push security". In development
  `PUSH_URL` points to **push-mock**, a small Expo-compatible stand-in. It shows what arrived at
  `http://push.raadi.localhost/messages`, and tokens containing "Unregistered" behave like an uninstalled
  app. That keeps development and CI offline (ADR-0009) and lets smoke tests check real deliveries.
- **Preferences.** `pushMessages` sits next to `emailMessages` (web notification settings and the app's
  account screen). A `PUT` without it keeps the stored value, so older clients don't reset it.

## Alternatives considered

- **Direct APNs and FCM** (no Expo service): needs an Apple developer account, APNs keys and a Firebase
  project before the first push, and does not work in Expo Go. Expo's tokens can later be swapped for
  native ones (`getDevicePushTokenAsync`) behind the same queue and device table.
- **ntfy, Gotify or another self-hosted push server**: OSI-licensed, but iOS still needs APNs, and the app
  would need its own native module. Not worth it before there is a production app in the stores.
- **Web Push for the website**: a separate channel with its own permission flow. It may come later, but the
  website already sends e-mails and in-app notices.
- **Checking delivery receipts** (`getReceipts`): would catch a few more uninstalled apps hours later. The
  send tickets already report most of them. Receipts can be added to the sender loop if stale tokens pile up.

## Consequences

- Real pushes to a phone need the Expo push service: in phone mode, run
  `PUSH_URL=https://exp.host/--/api/v2/push/send ./raadi phone` (docs/mobile.md). Expo Go on Android
  cannot receive remote pushes (SDK 53+); a development build can.
- Expo's push service is a hosted service outside the OSI rule (like Vipps, ADR-0020). The platform runs
  offline without it, and the queue and device table don't depend on it.
- Push tokens are personal data (they identify a device). They are deleted on sign-out and when the app is
  uninstalled. Account deletion (Phase 4 GDPR work) must delete them too.
