# ForUs

An app for free Malayalam TV: live news, serials and shows. All of it comes from
official channels' free YouTube uploads. There are no logins, no API keys and no
pirated sources.

The same APK runs on Android TV (in the TV launcher, driven by the remote) and on
Android phones (touch, either orientation).

## Channels

Edit [src/data/channels.ts](src/data/channels.ts) to add or remove channels.

- **Search** (top right) searches YouTube but keeps only results from the
  official channels in [src/data/channels.ts](src/data/channels.ts)
  (`TRUSTED_CHANNELS`), plus matching files in your TorBox. YouTube itself is
  full of pirated re-uploads, which this filter keeps out.
- **New today** merges the newest uploads from every show and movie channel.
  Pull down on the home screen (or press **Refresh** on a TV) to fetch fresh
  lists.
- **Recently Watched** appears at the top once you've played something: the last
  20 videos and live channels, newest first, saved on the device.
- **Live News** plays a channel's current YouTube live stream.
- **Serials & Shows** lists each channel's latest long videos (Shorts are left out).
- **Movies** lists complete films from verified distributor channels (Speed Audio
  & Video, Matinee Now, Musiczone Movies). Each has `titleFilter` set, so only
  uploads titled "full movie" appear and trailers and songs are left out.

## My TorBox

Plays the video files already in your own [TorBox](https://torbox.app) account
(torrents, Usenet and web downloads), in the app's own video player. Choose
**Connect TorBox** on the home screen and paste your API key from TorBox's
settings. The key is checked with TorBox and saved only on that device.

The app only lists and plays what is already in the account. It has no search
and doesn't add downloads. Each play asks TorBox for a fresh stream link,
because the links expire. MKV files with DTS audio may play without sound
because most phones and TVs can't decode DTS.

## Remote

| Button | On the home screen | In the player |
| --- | --- | --- |
| Arrows | Move between cards | Left/right skip 10 seconds |
| OK | Play | Pause / play |
| Back | Exit | Back to home |

On a phone, tap a card to play it and use YouTube's own controls. ✕ or Back
closes the player, and rotating to landscape fills the screen.

## Sources

A video can be played from more than one place, so the player keeps a list of
sources and moves down it until one of them works. The first source is the
official YouTube one; the rest are fallbacks for when a channel doesn't allow
embedding or YouTube itself is unreachable.

| Source | What it is |
| --- | --- |
| YouTube | The official embed, driven by the YouTube iframe API |
| YouTube watch page / mobile | The normal YouTube page in the player, used when a channel refuses embeds |
| VidSrc | The VidSrc embed frontend |
| Piped | The Piped embed frontend, plus Piped's API for a direct stream |
| Invidious | The Invidious embed frontend, plus Invidious's API for a direct stream |
| Cobalt | The Cobalt API for a direct stream |
| Consumet | A Consumet mirror for a direct stream |

The third-party services are public and often down, so they are treated as
optional: a source that fails is remembered and skipped for a while, and the
app falls back to the next one. **Sources** on the player (top right on a TV,
under the title on a phone) opens the list, so a source can be picked by hand.

Live channels are looked up on YouTube first: the channel's `/live` page says
which stream is on air right now, and that stream is played. YouTube removed
permanent live embeds, so the old `/embed/live_stream` link is only the last
resort.

Adding a source means adding one entry in
[src/api/sources.ts](src/api/sources.ts); the instance lists for the public
services are in [src/api/extractors.ts](src/api/extractors.ts).

## Running on a TV or phone

You need Node 20+, JDK 17 and the Android SDK (installing Android Studio gives
you both). Then:

```sh
npm install
npx expo prebuild --platform android --clean
adb connect <tv-ip-address>:5555    # TV: turn on Developer options → Network debugging first
                                    # Phone: plug in by USB with USB debugging on instead
npx expo run:android                # builds, installs and starts the app on the device
```

To build an APK you can copy onto the TV yourself:

```sh
cd android && ./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk
```
