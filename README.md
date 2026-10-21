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

## Movie Catalog

The **Catalog** section in the TorBox tab is a film catalog: browse the popular
films or search for one, then pick a release and the app sends it to your
TorBox and plays it.

- The catalog comes from [Cinemeta](https://v3-cinemeta.strem.io), Stremio's
  free metadata service. It needs no key and gives every film an IMDb id.
  The list grows as you scroll.
- The releases for a film come from [Torrentio](https://torrentio.strem.fun), a
  public Stremio addon. It answers with the releases the indexers have, with
  their quality, size and number of seeds.
- A search also looks for releases **by name**, across The Pirate Bay's open
  index and Nyaa, so anything with a torrent can be found — films the other
  sources don't know about, anime, and the rest. Releases come first in a
  search, with the films they matched under them.
- Picking a release builds a magnet link and hands it to TorBox, which
  downloads it into your own cloud. The app then follows the download, shows
  the progress, and opens the file in the player when it's ready.

Nothing is downloaded until you pick a release, and everything goes into your
own TorBox account, so a film you start here also shows up under **My
TorBox**. TorBox allows 60 uncached downloads an hour; if you hit that, its
own message is shown.

The public indexes turn away bursts and are sometimes blocked outright, so
each one is optional: one that stops answering is remembered and left alone
for a while, and the search carries on with whatever else answers.

## MovieBox

The **MovieBox** tab is a second film catalog, on the same lines as the
MovieBoxTV app: the sections it shows (Trending, Movie, Anime, TV, Kids,
Indian, Hindi, Tamil, Telugu) as rows of posters, a search over the same
catalogue, and a page for each film with its seasons and episodes.

- The catalogue and the streams come from the MovieBox API the app itself
  uses, on `api6.aoneroom.com` and the hosts behind it. No account is needed:
  the app signs in as a visitor and keeps that token on the device.
- Every request is signed the way the app signs it, in
  [src/api/moviebox.ts](src/api/moviebox.ts). The MD5 it needs is written
  out in [src/api/md5.ts](src/api/md5.ts), so nothing native is added to the
  app.
- **Play now** streams the file itself, in the app's own player. The service
  offers a short preview to everyone, and the whole file is fetched by its id
  — the same request the patched app makes. The links expire, so a fresh one
  is fetched each time and again if the video stops.
- **Send to TorBox** is there as well: the same film is looked up by name on
  the torrent indexes, and a release can be sent to your TorBox like any
  other film in the catalog.

The service is not a public API and can change or refuse requests at any
time, so this tab is kept separate from the rest of the app: if it stops
answering, only this tab is affected.

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
