# XREAL Air Gaming
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U7U8OVC0L) [![Chat](https://img.shields.io/badge/chat-on%20discord-7289da.svg)](https://deckbrew.xyz/discord)

This plugin provides virtual display and head-tracking modes for the XREAL Air glasses by installing [Breezy Vulkan](https://github.com/wheaney/breezy-desktop/tree/vulkan). It also provides a UI for easily changing common configurations. All without leaving Game Mode.

For the moment, virtual display support only works for Vulkan games. See [Upcoming features](#upcoming-features) for expanding this.

![XREAL Air Gaming plugin](./assets/store_image.png)

## How it works

This plugin installs and keeps you up-to-date with the latest version of Breezy. Going into the plugin settings allows you to disable Breezy or configure its behavior.

## Configuration Options

From the plugin settings, you can control the following:
* **Enable/disable the driver**. When disabled, your Air glasses will be display-only, no head movements will be tracked.
* **Change headset modes**. In virtual display mode, a display will be rendered in a fixed space, allowing you to move your head to look at different parts of the screen. In mouse-mode, head movements are translated to mouse movements, while in joystick-mode, they're translated to right-joystick movements on a virtual controller.
* **Mouse sensitivity**. In mouse-mode, this setting controls how much/quickly the mouse will move relative to your head movements.
* **Display size**. In virtual display mode, this setting controls how big the screen appears. A setting of 1 will render at the game's resolution, while a higher setting zooms in (e.g. 2 for 2x zoom) and lower zooms out (e.g. 0.5 for a 50% smaller screen). 
* **Movement look-ahead**. In virtual display mode, Breezy automatically attempts to anticipate where the screen will be when the next frame is rendered. If you find that its default look-ahead is producing a screen that drags behind your movements or a screen that is over-eager or jittery, you can tweak this yourself. The max is capped because higher values produce jitter and become unusable.

## Upcoming features
So much more is already in the works for this plugin! If you're enjoying it and any of the upcoming features sound appealing, or if you have a feature request, please consider [becoming a supporter](https://ko-fi.com/wheaney).

Upcoming features:
* Add support for XREAL Air 2/Pro glasses
* 3D SBS support for virtual display depth to make the display appear closer or farther away for eye comfort.
* 3D SBS content virtual display support: render 3D content in a body-anchor display.
* Virtual display for all of Game Mode, not just Vulkan games.
* General Linux virtual display support for productivity.
* Other XR hardware (Rokid, etc...)

## Decky Loader

This plugin requires [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader). XREAL Air Driver is available on the store.

## Steam Deck Homebrew Discord
[![Chat](https://img.shields.io/badge/chat-on%20discord-7289da.svg)](https://deckbrew.xyz/discord)