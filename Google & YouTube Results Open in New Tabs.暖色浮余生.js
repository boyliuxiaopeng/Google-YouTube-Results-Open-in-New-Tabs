// ==UserScript==
// @name         Google & YouTube Results Open in New Tabs
// @name:zh-CN   Google 和 YouTube 结果在新标签页打开
// @namespace    https://greasyfork.org/users/82488
// @version      1.1.1
// @description  Open Google search results and selected YouTube video, Shorts, live, playlist, and channel links in new tabs.
// @description:zh-CN  在新标签页中打开 Google 搜索结果，以及 YouTube 视频、Shorts、直播、播放列表和频道链接。
// @author       J
// @include      /^https:\/\/(?:www\.)?google\.(?:com|cat|[a-z]{2}|(?:com|co)\.[a-z]{2})\/search(?:[/?]|$).*/
// @match        https://youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-start
// @grant        GM_openInTab
// @noframes
// @license      MIT
// ==/UserScript==


(function () {
  "use strict";

  const config = {
    // 按住 Ctrl/Cmd/Shift/Alt 时，保留浏览器原生点击行为。
    respectModifiedClicks: true,

    // 是否让 YouTube 播放列表和频道链接也在新标签页打开。
    openYouTubeChannels: true,
    openYouTubePlaylists: true,
  };

  const GOOGLE_HOST_RE =
    /^(?:www\.)?google\.(?:com|cat|[a-z]{2}|(?:com|co)\.[a-z]{2})$/i;

  const YOUTUBE_HOST_RE =
    /^(?:www\.|m\.)?youtube\.com$/i;

  const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

  function isModifiedClick(event) {
    return (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  function toUrl(href) {
    if (!href) return null;

    try {
      return new URL(href, location.href);
    } catch {
      return null;
    }
  }

  function isHttpUrl(url) {
    return Boolean(url && HTTP_PROTOCOLS.has(url.protocol));
  }

  function normalizeHost(hostname) {
    return hostname.toLowerCase().replace(/^www\./, "");
  }

  function isCurrentGoogleHost(hostname) {
    return normalizeHost(hostname) === normalizeHost(location.hostname);
  }

  function unwrapGoogleRedirect(url) {
    if (!isCurrentGoogleHost(url.hostname) || url.pathname !== "/url") {
      return url;
    }

    const destination =
      url.searchParams.get("q") ||
      url.searchParams.get("url");

    const destinationUrl = toUrl(destination);

    return isHttpUrl(destinationUrl)
      ? destinationUrl
      : null;
  }

  function isGoogleSearchPage() {
    return (
      GOOGLE_HOST_RE.test(location.hostname) &&
      location.pathname === "/search"
    );
  }

  function getGoogleTarget(anchor, url) {
    if (!isGoogleSearchPage()) return null;
    if (!anchor.closest("#search, #rso")) return null;

    if (
      anchor.closest(
        '[role="navigation"], ' +
        '[role="menu"], ' +
        "form, " +
        "header, " +
        "g-menu, " +
        ".hdtb-mitem, " +
        "#foot"
      )
    ) {
      return null;
    }

    const destination = unwrapGoogleRedirect(url);

    if (!isHttpUrl(destination)) return null;

    if (isCurrentGoogleHost(destination.hostname)) {
      const internalPaths = new Set([
        "/",
        "/search",
        "/webhp",
        "/preferences",
        "/advanced_search",
        "/setprefs",
      ]);

      if (internalPaths.has(destination.pathname)) {
        return null;
      }
    }

    return destination.href;
  }

  function getYouTubeTarget(anchor, url) {
    if (!YOUTUBE_HOST_RE.test(location.hostname)) return null;
    if (!YOUTUBE_HOST_RE.test(url.hostname)) return null;
    if (!isHttpUrl(url)) return null;

    if (
      anchor.closest(
        "ytd-guide-renderer, " +
        "ytd-mini-guide-renderer, " +
        "ytd-masthead, " +
        "ytd-topbar-menu-button-renderer, " +
        "ytd-popup-container"
      )
    ) {
      return null;
    }

    const path = url.pathname;

    // 普通视频。
    if (
      path === "/watch" &&
      url.searchParams.has("v")
    ) {
      return url.href;
    }

    // Shorts、直播和剪辑。
    if (/^\/shorts\/[^/]+/.test(path)) return url.href;
    if (/^\/live\/[^/]+/.test(path)) return url.href;
    if (/^\/clip\/[^/]+/.test(path)) return url.href;

    // 播放列表。
    if (
      config.openYouTubePlaylists &&
      path === "/playlist" &&
      url.searchParams.has("list")
    ) {
      return url.href;
    }

    // 频道主页及频道子页面。
    if (
      config.openYouTubeChannels &&
      (
        path.startsWith("/@") ||
        path.startsWith("/channel/") ||
        path.startsWith("/c/") ||
        path.startsWith("/user/")
      )
    ) {
      return url.href;
    }

    return null;
  }

  function findAnchor(event) {
    if (typeof event.composedPath === "function") {
      for (const node of event.composedPath()) {
        if (
          node &&
          typeof node.matches === "function" &&
          node.matches("a[href]")
        ) {
          return node;
        }
      }
    }

    return (
      event.target &&
      typeof event.target.closest === "function"
    )
      ? event.target.closest("a[href]")
      : null;
  }

  function getTargetUrl(anchor) {
    if (!anchor || !anchor.href) return null;

    // 尊重下载链接和网页原本已经设置的新标签页链接。
    if (anchor.hasAttribute("download")) return null;

    if ((anchor.target || "").toLowerCase() === "_blank") {
      return null;
    }

    const url = toUrl(anchor.href);

    if (!isHttpUrl(url)) return null;

    return (
      getGoogleTarget(anchor, url) ||
      getYouTubeTarget(anchor, url)
    );
  }

  function openInNewTab(event) {
    // 不处理脚本模拟的点击，也不接管已经被其他代码取消的事件。
    if (!event.isTrusted || event.defaultPrevented) return;

    if (
      config.respectModifiedClicks &&
      isModifiedClick(event)
    ) {
      return;
    }

    const anchor = findAnchor(event);
    const targetUrl = getTargetUrl(anchor);

    if (!targetUrl) return;

    try {
      GM_openInTab(targetUrl, {
        active: true,
        insert: true,
        setParent: false,
      });
    } catch (error) {
      console.error(
        "Failed to open result in a new tab:",
        error
      );
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  document.addEventListener("click", openInNewTab, {
    capture: true,
    passive: false,
  });
})();
