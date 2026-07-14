// ==UserScript==
// @name         Google & YouTube Results Open in New Tabs
// @name:zh-CN   Google 和 YouTube 结果在新标签页打开
// @namespace    https://greasyfork.org/users/82488
// @namespace    https://github.com/boyliuxiaopeng/Google-YouTube-Results-Open-in-New-Tabs
// @version      1.1.2
// @description  Open Google search results and selected YouTube video, Shorts, live, playlist, and channel links in new tabs.
// @description:zh-CN  在新标签页中打开 Google 搜索结果，以及 YouTube 视频、Shorts、直播、播放列表和频道链接。
// @author       暖色浮余生
// @include      /^https:\/\/(?:www\.)?google\.com\/search(?:[/?]|$).*/
// @include      /^https:\/\/(?:www\.)?google\.cat\/search(?:[/?]|$).*/
// @include      /^https:\/\/(?:www\.)?google\.[a-z]{2}\/search(?:[/?]|$).*/
// @include      /^https:\/\/(?:www\.)?google\.(?:com|co)\.[a-z]{2}\/search(?:[/?]|$).*/
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

  const CONFIG = Object.freeze({
    /**
     * 按住 Ctrl、Command、Shift 或 Alt 时，
     * 保留浏览器原生点击行为。
     */
    respectModifiedClicks: true,

    /**
     * 是否让 YouTube 频道链接在新标签页打开。
     */
    openYouTubeChannels: true,

    /**
     * 是否让 YouTube 播放列表链接在新标签页打开。
     */
    openYouTubePlaylists: true,
  });

  /**
   * 支持的 Google 搜索域名。
   *
   * 示例：
   * google.com
   * google.cn
   * google.co.uk
   * google.com.hk
   */
  const GOOGLE_HOST_RE =
    /^(?:www\.)?google\.(?:com|cat|[a-z]{2}|(?:com|co)\.[a-z]{2})$/i;

  /**
   * 支持的 YouTube 域名。
   */
  const YOUTUBE_HOST_RE =
    /^(?:www\.|m\.)?youtube\.com$/i;

  /**
   * YouTube 频道路径。
   *
   * 支持：
   * /@handle
   * /@handle/videos
   * /channel/UC...
   * /c/name
   * /user/name
   */
  const YOUTUBE_CHANNEL_PATH_RE =
    /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(?:\/|$)/i;

  /**
   * 允许处理的 URL 协议。
   */
  const HTTP_PROTOCOLS = new Set([
    "http:",
    "https:",
  ]);

  /**
   * Google 搜索结果容器。
   */
  const GOOGLE_RESULT_CONTAINER_SELECTOR =
    "#search, #rso";

  /**
   * Google 搜索页中不应接管的界面区域。
   */
  const GOOGLE_EXCLUDED_SELECTOR = [
    '[role="navigation"]',
    '[role="menu"]',
    "form",
    "header",
    "g-menu",
    ".hdtb-mitem",
    "#foot",
  ].join(", ");

  /**
   * YouTube 中不应接管的导航、菜单和弹出区域。
   *
   * 同时兼容桌面版和移动网页版。
   */
  const YOUTUBE_EXCLUDED_SELECTOR = [
    '[role="navigation"]',
    '[role="menu"]',

    // YouTube 桌面版导航区域。
    "ytd-guide-renderer",
    "ytd-mini-guide-renderer",
    "ytd-masthead",
    "ytd-topbar-menu-button-renderer",

    // YouTube 桌面版弹出菜单。
    "ytd-popup-container",
    "ytd-menu-popup-renderer",
    "tp-yt-paper-dialog",

    // YouTube 移动网页版导航区域。
    "ytm-mobile-topbar-renderer",
    "ytm-pivot-bar-renderer",
    "ytm-menu",
  ].join(", ");

  /**
   * 不应被视为 Google 搜索结果的内部路径。
   */
  const GOOGLE_INTERNAL_PATHS = new Set([
    "/",
    "/search",
    "/webhp",
    "/preferences",
    "/advanced_search",
    "/setprefs",
  ]);

  /**
   * 判断是否为修改键点击或非左键点击。
   */
  function isModifiedClick(event) {
    return (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  /**
   * 将字符串安全转换为 URL。
   */
  function toUrl(href) {
    if (!href) return null;

    try {
      return new URL(href, location.href);
    } catch {
      return null;
    }
  }

  /**
   * 判断 URL 是否使用 HTTP 或 HTTPS 协议。
   */
  function isHttpUrl(url) {
    return Boolean(
      url &&
      HTTP_PROTOCOLS.has(url.protocol)
    );
  }

  /**
   * 标准化主机名。
   */
  function normalizeHost(hostname) {
    return String(hostname)
      .toLowerCase()
      .replace(/^www\./, "");
  }

  /**
   * 标准化路径。将： /search/ 转换为： /search  根路径 "/" 保持不变。
   */
  function normalizePathname(pathname) {
    if (!pathname || pathname === "/") {
      return "/";
    }

    return pathname.replace(/\/+$/, "");
  }

  /**
   * 判断主机名是否为支持的 Google 搜索域名。
   */
  function isGoogleHost(hostname) {
    return GOOGLE_HOST_RE.test(hostname);
  }

  /**
   * 判断主机名是否为支持的 YouTube 域名。
   */
  function isYouTubeHost(hostname) {
    return YOUTUBE_HOST_RE.test(hostname);
  }

  /**
   * 判断目标 URL 是否属于当前 Google 域名。
   */
  function isCurrentGoogleHost(hostname) {
    return (
      normalizeHost(hostname) ===
      normalizeHost(location.hostname)
    );
  }

  /**
   * 解析 Google /url 跳转链接。
   *
   * 示例：
   * https://www.google.com/url?q=https://example.com
   *
   * 将返回：
   * https://example.com
   */
  function unwrapGoogleRedirect(url) {
    if (
      !isGoogleHost(url.hostname) ||
      normalizePathname(url.pathname) !== "/url"
    ) {
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

  /**
   * 判断当前页面是否为 Google 搜索页。
   */
  function isGoogleSearchPage() {
    return (
      isGoogleHost(location.hostname) &&
      normalizePathname(location.pathname) === "/search"
    );
  }

  /**
   * 判断当前页面是否为 YouTube 页面。
   */
  function isYouTubePage() {
    return isYouTubeHost(location.hostname);
  }

  /**
   * 获取 Google 搜索结果的目标 URL。
   */
  function getGoogleTarget(anchor, url) {
    if (!isGoogleSearchPage()) {
      return null;
    }

    /**
     * 只处理 Google 主搜索结果区域中的链接。
     */
    if (!anchor.closest(GOOGLE_RESULT_CONTAINER_SELECTOR)) {
      return null;
    }

    /**
     * 排除搜索导航、菜单、表单和底部链接。
     */
    if (anchor.closest(GOOGLE_EXCLUDED_SELECTOR)) {
      return null;
    }

    const destination = unwrapGoogleRedirect(url);

    if (!isHttpUrl(destination)) {
      return null;
    }

    /**
     * 排除 Google 自身的搜索、设置和导航链接。 对所有支持的 Google 国家或地区域名生效， 避免将跨 Google 域名的搜索导航误认为结果。
     */
    if (isGoogleHost(destination.hostname)) {
      const destinationPath =
        normalizePathname(destination.pathname);

      if (GOOGLE_INTERNAL_PATHS.has(destinationPath)) {
        return null;
      }
    }

    /**
     * 如果目标仍然是当前 Google 域名的 /url， 但没有可用的真实目标，则不接管。
     */
    if (
      isCurrentGoogleHost(destination.hostname) &&
      normalizePathname(destination.pathname) === "/url"
    ) {
      return null;
    }

    return destination.href;
  }

  /**
   * 获取 YouTube 内容链接的目标 URL。
   */
  function getYouTubeTarget(anchor, url) {
    if (!isYouTubePage()) {
      return null;
    }

    if (!isYouTubeHost(url.hostname)) {
      return null;
    }

    if (!isHttpUrl(url)) {
      return null;
    }

    /**
     * 不处理导航栏、侧边栏、菜单和弹出窗口中的链接。
     */
    if (anchor.closest(YOUTUBE_EXCLUDED_SELECTOR)) {
      return null;
    }

    const path = normalizePathname(url.pathname);

    /**
     * 普通视频。
     *
     * 示例：
     * /watch?v=VIDEO_ID
     */
    if (
      path === "/watch" &&
      Boolean(url.searchParams.get("v"))
    ) {
      return url.href;
    }

    /**
     * Shorts。
     *
     * 示例：
     * /shorts/VIDEO_ID
     */
    if (/^\/shorts\/[^/]+(?:\/|$)/i.test(path)) {
      return url.href;
    }

    /**
     * 直播。
     *
     * 示例：
     * /live/VIDEO_ID
     */
    if (/^\/live\/[^/]+(?:\/|$)/i.test(path)) {
      return url.href;
    }

    /**
     * YouTube 剪辑。
     *
     * 示例：
     * /clip/CLIP_ID
     */
    if (/^\/clip\/[^/]+(?:\/|$)/i.test(path)) {
      return url.href;
    }

    /**
     * 播放列表。
     *
     * 示例：
     * /playlist?list=PLAYLIST_ID
     */
    if (
      CONFIG.openYouTubePlaylists &&
      path === "/playlist" &&
      Boolean(url.searchParams.get("list"))
    ) {
      return url.href;
    }

    /**
     * 频道主页和频道子页面。
     *
     * 示例：
     * /@channel
     * /@channel/videos
     * /channel/UC...
     * /c/channel
     * /user/channel
     */
    if (
      CONFIG.openYouTubeChannels &&
      YOUTUBE_CHANNEL_PATH_RE.test(path)
    ) {
      return url.href;
    }

    return null;
  }

  /**
   * 从点击事件中查找对应的链接元素。
   * 优先使用 composedPath()，
   * 以兼容 Shadow DOM 和复杂的页面组件结构。
   */
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

    if (
      event.target &&
      typeof event.target.closest === "function"
    ) {
      return event.target.closest("a[href]");
    }

    return null;
  }

  /**
   * 获取点击链接最终需要在新标签页打开的 URL。
   */
  function getTargetUrl(anchor) {
    if (!anchor || !anchor.href) {
      return null;
    }

    /**
     * 尊重下载链接。
     */
    if (anchor.hasAttribute("download")) {
      return null;
    }

    /**
     * 尊重页面原本设置的 target。
     *
     * _self 仍由本脚本处理；
     * _blank、_top、_parent 或命名窗口保留原始行为。
     */
    const anchorTarget =
      String(anchor.target || "").toLowerCase();

    if (
      anchorTarget &&
      anchorTarget !== "_self"
    ) {
      return null;
    }

    const url = toUrl(anchor.href);

    if (!isHttpUrl(url)) {
      return null;
    }

    return (
      getGoogleTarget(anchor, url) ||
      getYouTubeTarget(anchor, url)
    );
  }

  /**
   * 在新标签页中打开目标链接。
   */
  function openInNewTab(event) {
    /**
     * 不处理脚本模拟的点击。
     */
    if (!event.isTrusted) {
      return;
    }

    /**
     * 如果事件已被其他脚本取消，则不再接管。
     */
    if (event.defaultPrevented) {
      return;
    }

    /**
     * 保留 Ctrl、Command、Shift、Alt 和非左键点击行为。
     */
    if (
      CONFIG.respectModifiedClicks &&
      isModifiedClick(event)
    ) {
      return;
    }

    const anchor = findAnchor(event);
    const targetUrl = getTargetUrl(anchor);

    if (!targetUrl) {
      return;
    }

    try {
      GM_openInTab(targetUrl, {
        /**
         * 打开后立即切换到新标签页。
         * 如需后台打开，可改为 false。
         */
        active: true,

        /**
         * 尽量将新标签页插入当前标签页之后。
         */
        insert: true,

        /**
         * 不将新标签页设置为当前标签页的子标签页。
         */
        setParent: false,
      });
    } catch (error) {
      console.error(
        "[Google & YouTube Results Open in New Tabs] " +
          "Failed to open URL in a new tab:",
        targetUrl,
        error
      );

      /**
       * 打开失败时不阻止原始点击，
       * 让浏览器继续执行正常导航。
       */
      return;
    }

    /**
     * GM_openInTab 成功执行后，
     * 阻止当前页面继续处理此次点击。
     */
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  /**
   * 使用捕获阶段监听，
   * 在 Google 和 YouTube 自身的点击处理器之前运行。
   */
  document.addEventListener(
    "click",
    openInNewTab,
    {
      capture: true,
      passive: false,
    }
  );
})();
