/*
 * Our Date - Kakao Map current location + compass add-on
 *
 * 사용법:
 *   1) 이 파일을 index.html과 같은 경로에 업로드
 *   2) index.html의 </body> 바로 위에 아래 한 줄 추가
 *      <script src="/map-location-addon.js?v=1"></script>
 *
 * 기존 index.html의 지도/뒤로가기 로직은 건드리지 않고
 * renderDateMap(), showScreen()에 기능을 덧붙이는 방식입니다.
 */

(function () {
  "use strict";

  const LOCATION_BLUE = "#3182f6";

  const state = {
    watchId: null,
    currentPosition: null,
    accuracyCircle: null,
    locationOverlay: null,
    locationElement: null,
    headingConeElement: null,
    headingDotElement: null,

    followLocation: false,
    compassActive: false,
    compassHeading: null,
    unwrappedHeading: null,
    hasAbsoluteOrientation: false,

    orientationListenersAttached: false,
    statusTimer: null,

    wrapper: null,
    locationButton: null,
    compassButton: null,
    compassNeedle: null,
    statusElement: null,

    mapDragHandler: null
  };


  /* =====================================================
     STYLE / UI
  ===================================================== */

  function injectLocationStyles() {
    if (document.getElementById("ourDateMapLocationStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "ourDateMapLocationStyles";

    style.textContent = `
      .our-date-map-location-wrap {
        position: relative;
        width: 100%;
      }

      .our-date-map-location-tools {
        position: absolute;
        right: 12px;
        bottom: 12px;
        z-index: 40;

        display: flex;
        flex-direction: column;
        gap: 8px;

        pointer-events: none;
      }

      .our-date-map-location-button {
        width: 44px;
        height: 44px;

        display: flex;
        align-items: center;
        justify-content: center;

        padding: 0;

        border: 1px solid rgba(0,0,0,0.12);
        border-radius: 50%;

        background: rgba(255,255,255,0.96);
        color: #444;

        box-shadow:
          0 2px 8px rgba(0,0,0,0.16);

        -webkit-tap-highlight-color: transparent;
        pointer-events: auto;
      }

      .our-date-map-location-button:active {
        transform: scale(0.96);
      }

      .our-date-map-location-button.active {
        color: ${LOCATION_BLUE};
        border-color: rgba(49,130,246,0.38);
        background: #f4f8ff;
      }

      .our-date-map-location-button svg {
        width: 23px;
        height: 23px;
        display: block;
      }

      .our-date-map-compass-icon {
        position: relative;

        width: 24px;
        height: 24px;

        display: flex;
        align-items: center;
        justify-content: center;
      }

      .our-date-map-compass-n {
        position: absolute;
        top: -1px;
        left: 50%;

        transform: translateX(-50%);

        font-size: 8px;
        font-weight: 900;
        line-height: 1;
      }

      .our-date-map-compass-needle {
        width: 0;
        height: 0;

        margin-top: 4px;

        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-bottom: 15px solid currentColor;

        transform-origin: 50% 62%;
        will-change: transform;
      }

      .our-date-map-location-status {
        position: absolute;
        left: 50%;
        top: 12px;
        z-index: 40;

        display: none;

        max-width: calc(100% - 120px);

        padding: 8px 11px;

        transform: translateX(-50%);

        border-radius: 999px;

        background: rgba(40,40,40,0.82);
        color: white;

        font-size: 11px;
        font-weight: 700;
        line-height: 1.35;
        text-align: center;

        box-shadow:
          0 2px 8px rgba(0,0,0,0.14);

        pointer-events: none;
      }

      .our-date-map-location-status.active {
        display: block;
      }

      .our-date-current-location {
        position: relative;

        width: 86px;
        height: 86px;

        pointer-events: none;
      }

      .our-date-current-location-cone {
        position: absolute;
        left: 50%;
        bottom: 50%;

        width: 58px;
        height: 68px;

        opacity: 0;

        transform:
          translateX(-50%)
          rotate(0deg);

        transform-origin: 50% 100%;

        clip-path:
          polygon(
            50% 0%,
            100% 100%,
            0% 100%
          );

        background:
          linear-gradient(
            to top,
            rgba(49,130,246,0.06),
            rgba(49,130,246,0.32)
          );

        will-change: transform;
      }

      .our-date-current-location-cone.visible {
        opacity: 1;
      }

      .our-date-current-location-halo {
        position: absolute;
        left: 50%;
        top: 50%;

        width: 30px;
        height: 30px;

        transform: translate(-50%, -50%);

        border-radius: 50%;

        background: rgba(49,130,246,0.18);
      }

      .our-date-current-location-dot {
        position: absolute;
        left: 50%;
        top: 50%;

        width: 18px;
        height: 18px;

        transform: translate(-50%, -50%);

        border: 3px solid white;
        border-radius: 50%;

        background: ${LOCATION_BLUE};

        box-shadow:
          0 1px 5px rgba(0,0,0,0.32);
      }

      @media (max-width: 480px) {
        .our-date-map-location-tools {
          right: 10px;
          bottom: 10px;
        }

        .our-date-map-location-button {
          width: 43px;
          height: 43px;
        }
      }
    `;

    document.head.appendChild(style);
  }


  function createLocationUi() {
    const mapElement =
      document.getElementById("dateMap");

    if (!mapElement) {
      return;
    }

    if (
      mapElement.parentElement
      &&
      mapElement.parentElement.classList.contains(
        "our-date-map-location-wrap"
      )
    ) {
      state.wrapper =
        mapElement.parentElement;

      state.locationButton =
        document.getElementById(
          "ourDateMapLocationButton"
        );

      state.compassButton =
        document.getElementById(
          "ourDateMapCompassButton"
        );

      state.compassNeedle =
        document.getElementById(
          "ourDateMapCompassNeedle"
        );

      state.statusElement =
        document.getElementById(
          "ourDateMapLocationStatus"
        );

      return;
    }

    const wrapper =
      document.createElement("div");

    wrapper.className =
      "our-date-map-location-wrap";

    mapElement.parentNode.insertBefore(
      wrapper,
      mapElement
    );

    wrapper.appendChild(
      mapElement
    );


    const tools =
      document.createElement("div");

    tools.className =
      "our-date-map-location-tools";


    const locationButton =
      document.createElement("button");

    locationButton.type =
      "button";

    locationButton.id =
      "ourDateMapLocationButton";

    locationButton.className =
      "our-date-map-location-button";

    locationButton.setAttribute(
      "aria-label",
      "현재 위치로 이동"
    );

    locationButton.title =
      "현재 위치";

    locationButton.innerHTML = `
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="4"
          fill="currentColor"
        ></circle>

        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        ></circle>

        <path
          d="M12 2V5 M12 19V22 M2 12H5 M19 12H22"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        ></path>
      </svg>
    `;


    const compassButton =
      document.createElement("button");

    compassButton.type =
      "button";

    compassButton.id =
      "ourDateMapCompassButton";

    compassButton.className =
      "our-date-map-location-button";

    compassButton.setAttribute(
      "aria-label",
      "방향 나침반 켜기"
    );

    compassButton.title =
      "방향 나침반";

    compassButton.innerHTML = `
      <span
        class="our-date-map-compass-icon"
        aria-hidden="true"
      >
        <span
          class="our-date-map-compass-n"
        >
          N
        </span>

        <span
          id="ourDateMapCompassNeedle"
          class="our-date-map-compass-needle"
        ></span>
      </span>
    `;


    tools.appendChild(
      compassButton
    );

    tools.appendChild(
      locationButton
    );


    const status =
      document.createElement("div");

    status.id =
      "ourDateMapLocationStatus";

    status.className =
      "our-date-map-location-status";

    status.setAttribute(
      "role",
      "status"
    );

    status.setAttribute(
      "aria-live",
      "polite"
    );


    wrapper.appendChild(
      tools
    );

    wrapper.appendChild(
      status
    );


    state.wrapper =
      wrapper;

    state.locationButton =
      locationButton;

    state.compassButton =
      compassButton;

    state.compassNeedle =
      document.getElementById(
        "ourDateMapCompassNeedle"
      );

    state.statusElement =
      status;


    locationButton.addEventListener(
      "click",
      handleLocationButtonClick
    );

    compassButton.addEventListener(
      "click",
      handleCompassButtonClick
    );
  }


  function showLocationStatus(
    message,
    duration = 2800
  ) {
    if (!state.statusElement) {
      return;
    }

    clearTimeout(
      state.statusTimer
    );

    state.statusElement.textContent =
      message;

    state.statusElement.classList.add(
      "active"
    );

    if (duration > 0) {
      state.statusTimer =
        setTimeout(
          function () {
            state.statusElement.classList.remove(
              "active"
            );
          },
          duration
        );
    }
  }


  function hideLocationStatus() {
    clearTimeout(
      state.statusTimer
    );

    if (state.statusElement) {
      state.statusElement.classList.remove(
        "active"
      );
    }
  }


  function updateLocationButton() {
    if (!state.locationButton) {
      return;
    }

    state.locationButton.classList.toggle(
      "active",
      state.followLocation
    );

    state.locationButton.setAttribute(
      "aria-label",
      state.followLocation
        ? "현재 위치 추적 중"
        : "현재 위치로 이동"
    );
  }


  function updateCompassButton() {
    if (!state.compassButton) {
      return;
    }

    state.compassButton.classList.toggle(
      "active",
      state.compassActive
    );

    state.compassButton.setAttribute(
      "aria-label",
      state.compassActive
        ? "방향 나침반 끄기"
        : "방향 나침반 켜기"
    );
  }


  /* =====================================================
     CURRENT LOCATION LAYERS
  ===================================================== */

  function createCurrentLocationOverlay(
    position
  ) {
    const locationElement =
      document.createElement("div");

    locationElement.className =
      "our-date-current-location";

    locationElement.innerHTML = `
      <div
        class="our-date-current-location-cone"
      ></div>

      <div
        class="our-date-current-location-halo"
      ></div>

      <div
        class="our-date-current-location-dot"
      ></div>
    `;

    const overlay =
      new kakao.maps.CustomOverlay({
        map:
          dateMap,

        position:
          position,

        content:
          locationElement,

        xAnchor:
          0.5,

        yAnchor:
          0.5,

        zIndex:
          10
      });

    state.locationElement =
      locationElement;

    state.headingConeElement =
      locationElement.querySelector(
        ".our-date-current-location-cone"
      );

    state.headingDotElement =
      locationElement.querySelector(
        ".our-date-current-location-dot"
      );

    state.locationOverlay =
      overlay;

    renderHeading();
  }


  function createAccuracyCircle(
    position,
    accuracy
  ) {
    state.accuracyCircle =
      new kakao.maps.Circle({
        map:
          dateMap,

        center:
          position,

        radius:
          accuracy,

        strokeWeight:
          1,

        strokeColor:
          LOCATION_BLUE,

        strokeOpacity:
          0.42,

        strokeStyle:
          "solid",

        fillColor:
          LOCATION_BLUE,

        fillOpacity:
          0.10,

        zIndex:
          1
      });
  }


  function clearLocationLayers() {
    if (state.locationOverlay) {
      state.locationOverlay.setMap(
        null
      );
    }

    if (state.accuracyCircle) {
      state.accuracyCircle.setMap(
        null
      );
    }

    state.locationOverlay =
      null;

    state.accuracyCircle =
      null;

    state.locationElement =
      null;

    state.headingConeElement =
      null;

    state.headingDotElement =
      null;
  }


  function updateCurrentLocationLayers(
    browserPosition
  ) {
    if (
      typeof kakao === "undefined"
      ||
      !kakao.maps
      ||
      !dateMap
    ) {
      return;
    }

    const coords =
      browserPosition.coords;

    const position =
      new kakao.maps.LatLng(
        coords.latitude,
        coords.longitude
      );

    const accuracy =
      Math.max(
        1,
        Number(
          coords.accuracy
        )
        ||
        1
      );


    if (!state.locationOverlay) {
      createCurrentLocationOverlay(
        position
      );
    }
    else {
      state.locationOverlay.setPosition(
        position
      );
    }


    if (!state.accuracyCircle) {
      createAccuracyCircle(
        position,
        accuracy
      );
    }
    else {
      state.accuracyCircle.setPosition(
        position
      );

      state.accuracyCircle.setRadius(
        accuracy
      );
    }


    /*
      GPS 자체가 진행방향(heading)을 주는 경우:
      걷거나 이동 중이고 기기 방향 센서값이 아직 없을 때
      보조값으로만 사용한다.
    */
    if (
      state.compassActive
      &&
      !state.hasAbsoluteOrientation
      &&
      Number.isFinite(
        coords.heading
      )
    ) {
      updateHeading(
        coords.heading
      );
    }


    if (
      state.followLocation
      &&
      dateMap
    ) {
      dateMap.panTo(
        position
      );
    }
  }


  /* =====================================================
     GEOLOCATION
  ===================================================== */

  function getGeolocationErrorMessage(
    error
  ) {
    if (!error) {
      return "현재 위치를 가져오지 못했어.";
    }

    if (error.code === 1) {
      return "위치 권한이 꺼져 있어. 브라우저 설정에서 위치 권한을 허용해줘.";
    }

    if (error.code === 2) {
      return "현재 위치를 확인할 수 없어. GPS 또는 네트워크 상태를 확인해줘.";
    }

    if (error.code === 3) {
      return "위치 확인 시간이 너무 오래 걸리고 있어. 다시 눌러봐.";
    }

    return "현재 위치를 가져오지 못했어.";
  }


  function onLocationSuccess(
    position
  ) {
    state.currentPosition =
      position;

    updateCurrentLocationLayers(
      position
    );

    if (
      state.followLocation
      &&
      state.locationButton
    ) {
      updateLocationButton();
    }
  }


  function onLocationError(
    error
  ) {
    console.warn(
      "현재 위치 확인 실패:",
      error
    );

    state.followLocation =
      false;

    updateLocationButton();

    showLocationStatus(
      getGeolocationErrorMessage(
        error
      ),
      5200
    );
  }


  function startLocationWatch(
    options = {}
  ) {
    const silent =
      Boolean(
        options.silent
      );

    if (!window.isSecureContext) {
      if (!silent) {
        showLocationStatus(
          "현재 위치 기능은 HTTPS에서만 사용할 수 있어.",
          5000
        );
      }

      return false;
    }

    if (!("geolocation" in navigator)) {
      if (!silent) {
        showLocationStatus(
          "이 브라우저는 현재 위치 기능을 지원하지 않아.",
          5000
        );
      }

      return false;
    }

    if (state.watchId !== null) {
      return true;
    }

    if (!silent) {
      showLocationStatus(
        "현재 위치 확인 중...",
        0
      );
    }

    state.watchId =
      navigator.geolocation.watchPosition(
        function (
          position
        ) {
          if (!silent) {
            hideLocationStatus();
          }

          onLocationSuccess(
            position
          );
        },

        onLocationError,

        {
          enableHighAccuracy:
            true,

          maximumAge:
            3000,

          timeout:
            15000
        }
      );

    return true;
  }


  function stopLocationWatch() {
    if (
      state.watchId !== null
      &&
      "geolocation" in navigator
    ) {
      navigator.geolocation.clearWatch(
        state.watchId
      );
    }

    state.watchId =
      null;

    state.followLocation =
      false;

    updateLocationButton();
  }


  function centerMapOnCurrentLocation() {
    if (
      !state.currentPosition
      ||
      !dateMap
    ) {
      return false;
    }

    const position =
      new kakao.maps.LatLng(
        state.currentPosition.coords.latitude,
        state.currentPosition.coords.longitude
      );

    dateMap.panTo(
      position
    );

    /*
      후보 하나를 눌렀을 때와 비슷한 확대 수준.
      너무 과하게 확대하지 않도록 level 3 사용.
    */
    if (
      typeof dateMap.getLevel === "function"
      &&
      dateMap.getLevel() > 4
    ) {
      dateMap.setLevel(
        4
      );
    }

    return true;
  }


  function handleLocationButtonClick() {
    state.followLocation =
      true;

    updateLocationButton();

    const started =
      startLocationWatch({
        silent:
          false
      });

    if (!started) {
      state.followLocation =
        false;

      updateLocationButton();

      return;
    }


    if (
      centerMapOnCurrentLocation()
    ) {
      showLocationStatus(
        "현재 위치를 따라가는 중",
        1800
      );
    }
  }


  /* =====================================================
     COMPASS / DEVICE ORIENTATION
  ===================================================== */

  function normalizeHeading(
    heading
  ) {
    return (
      (
        Number(
          heading
        )
        %
        360
      )
      +
      360
    )
    %
    360;
  }


  function getScreenOrientationAngle() {
    if (
      screen.orientation
      &&
      Number.isFinite(
        screen.orientation.angle
      )
    ) {
      return screen.orientation.angle;
    }

    if (
      Number.isFinite(
        window.orientation
      )
    ) {
      return Number(
        window.orientation
      );
    }

    return 0;
  }


  function getCompassHeadingFromEvent(
    event
  ) {
    /*
      iOS Safari / iOS PWA
    */
    if (
      Number.isFinite(
        event.webkitCompassHeading
      )
    ) {
      return normalizeHeading(
        event.webkitCompassHeading
        +
        getScreenOrientationAngle()
      );
    }


    /*
      W3C absolute orientation:
      북쪽 기준 heading = 360 - alpha
    */
    if (
      event.absolute === true
      &&
      Number.isFinite(
        event.alpha
      )
    ) {
      return normalizeHeading(
        360
        -
        event.alpha
        +
        getScreenOrientationAngle()
      );
    }


    /*
      deviceorientationabsolute 이벤트는
      일부 브라우저에서 absolute 플래그가
      기대와 다르게 전달될 수도 있으므로
      이벤트 타입 자체도 확인한다.
    */
    if (
      event.type ===
        "deviceorientationabsolute"
      &&
      Number.isFinite(
        event.alpha
      )
    ) {
      return normalizeHeading(
        360
        -
        event.alpha
        +
        getScreenOrientationAngle()
      );
    }


    return null;
  }


  function unwrapHeading(
    normalizedHeading
  ) {
    if (
      state.unwrappedHeading ===
      null
    ) {
      state.unwrappedHeading =
        normalizedHeading;

      return state.unwrappedHeading;
    }

    const previousNormalized =
      normalizeHeading(
        state.unwrappedHeading
      );

    const delta =
      (
        (
          normalizedHeading
          -
          previousNormalized
          +
          540
        )
        %
        360
      )
      -
      180;

    state.unwrappedHeading +=
      delta;

    return state.unwrappedHeading;
  }


  function renderHeading() {
    const hasHeading =
      state.compassActive
      &&
      Number.isFinite(
        state.compassHeading
      );

    if (
      state.headingConeElement
    ) {
      state.headingConeElement.classList.toggle(
        "visible",
        hasHeading
      );

      if (hasHeading) {
        const displayHeading =
          unwrapHeading(
            state.compassHeading
          );

        state.headingConeElement.style.transform =
          "translateX(-50%) rotate("
          +
          displayHeading
          +
          "deg)";
      }
    }


    if (
      state.compassNeedle
    ) {
      if (hasHeading) {
        const displayHeading =
          state.unwrappedHeading === null
          ?
          state.compassHeading
          :
          state.unwrappedHeading;

        state.compassNeedle.style.transform =
          "rotate("
          +
          displayHeading
          +
          "deg)";
      }
      else {
        state.compassNeedle.style.transform =
          "rotate(0deg)";
      }
    }
  }


  function updateHeading(
    heading
  ) {
    if (
      !Number.isFinite(
        heading
      )
    ) {
      return;
    }

    state.compassHeading =
      normalizeHeading(
        heading
      );

    renderHeading();
  }


  function handleOrientationEvent(
    event
  ) {
    const heading =
      getCompassHeadingFromEvent(
        event
      );

    if (
      heading ===
      null
    ) {
      return;
    }

    state.hasAbsoluteOrientation =
      true;

    updateHeading(
      heading
    );
  }


  function attachOrientationListeners() {
    if (
      state.orientationListenersAttached
    ) {
      return;
    }

    window.addEventListener(
      "deviceorientationabsolute",
      handleOrientationEvent,
      true
    );

    window.addEventListener(
      "deviceorientation",
      handleOrientationEvent,
      true
    );

    state.orientationListenersAttached =
      true;
  }


  function detachOrientationListeners() {
    if (
      !state.orientationListenersAttached
    ) {
      return;
    }

    window.removeEventListener(
      "deviceorientationabsolute",
      handleOrientationEvent,
      true
    );

    window.removeEventListener(
      "deviceorientation",
      handleOrientationEvent,
      true
    );

    state.orientationListenersAttached =
      false;
  }


  async function requestOrientationAccess() {
    if (!window.isSecureContext) {
      throw new Error(
        "방향 센서는 HTTPS에서만 사용할 수 있어."
      );
    }

    if (
      typeof DeviceOrientationEvent ===
      "undefined"
    ) {
      throw new Error(
        "이 기기 또는 브라우저는 방향 센서를 지원하지 않아."
      );
    }


    /*
      iOS 13+:
      반드시 사용자의 버튼 터치 안에서 호출해야 한다.
    */
    if (
      typeof DeviceOrientationEvent.requestPermission ===
      "function"
    ) {
      const permission =
        await DeviceOrientationEvent.requestPermission();

      if (
        permission !==
        "granted"
      ) {
        throw new Error(
          "방향 센서 권한이 허용되지 않았어."
        );
      }
    }


    return true;
  }


  async function enableCompass() {
    try {
      await requestOrientationAccess();

      state.compassActive =
        true;

      state.compassHeading =
        null;

      state.unwrappedHeading =
        null;

      state.hasAbsoluteOrientation =
        false;

      attachOrientationListeners();

      updateCompassButton();
      renderHeading();

      showLocationStatus(
        "휴대폰을 돌리면 바라보는 방향이 표시돼.",
        3200
      );


      /*
        센서 신호가 안 오는 환경이면 짧게 안내.
        이미 GPS 진행방향이 잡힌 경우에는 그대로 사용.
      */
      setTimeout(
        function () {
          if (
            state.compassActive
            &&
            !Number.isFinite(
              state.compassHeading
            )
          ) {
            showLocationStatus(
              "방향 센서 신호가 없어. 기기 센서/브라우저 권한을 확인해줘.",
              4200
            );
          }
        },
        2200
      );

    } catch (error) {
      console.warn(
        "방향 센서 사용 실패:",
        error
      );

      state.compassActive =
        false;

      updateCompassButton();
      renderHeading();

      showLocationStatus(
        error.message
        ||
        "방향 센서를 사용할 수 없어.",
        5200
      );
    }
  }


  function disableCompass() {
    state.compassActive =
      false;

    state.compassHeading =
      null;

    state.unwrappedHeading =
      null;

    state.hasAbsoluteOrientation =
      false;

    detachOrientationListeners();

    updateCompassButton();
    renderHeading();

    showLocationStatus(
      "방향 표시를 껐어.",
      1500
    );
  }


  function handleCompassButtonClick() {
    if (
      state.compassActive
    ) {
      disableCompass();
      return;
    }

    enableCompass();
  }


  /* =====================================================
     MAP LIFECYCLE
  ===================================================== */

  function attachMapDragListener() {
    if (
      !dateMap
      ||
      typeof kakao ===
        "undefined"
      ||
      !kakao.maps
      ||
      !kakao.maps.event
    ) {
      return;
    }

    state.mapDragHandler =
      function () {
        if (
          state.followLocation
        ) {
          state.followLocation =
            false;

          updateLocationButton();

          showLocationStatus(
            "지도를 움직여 위치 추적을 잠시 멈췄어.",
            1800
          );
        }
      };

    kakao.maps.event.addListener(
      dateMap,
      "dragstart",
      state.mapDragHandler
    );
  }


  function resetLocationForNewMap() {
    clearLocationLayers();

    state.followLocation =
      false;

    updateLocationButton();

    state.currentPosition =
      null;
  }


  function activateLocationForRenderedMap() {
    if (!dateMap) {
      return;
    }

    attachMapDragListener();

    /*
      지도 진입 시 현재 위치는 자동으로 받아서 파란 점을 띄운다.
      지도 중심은 기존 후보 위치를 유지한다.
      사용자가 위치 버튼을 누르면 그때 내 위치 중심 추적을 시작한다.
    */
    startLocationWatch({
      silent:
        true
    });
  }


  function deactivateMapSensors() {
    stopLocationWatch();
    disableCompassSilently();
  }


  function disableCompassSilently() {
    state.compassActive =
      false;

    state.compassHeading =
      null;

    state.unwrappedHeading =
      null;

    state.hasAbsoluteOrientation =
      false;

    detachOrientationListeners();

    updateCompassButton();
    renderHeading();
  }


  /* =====================================================
     INSTALL HOOKS
  ===================================================== */

  function installHooks() {
    if (
      typeof renderDateMap !==
      "function"
    ) {
      console.warn(
        "Our Date 위치 애드온: renderDateMap()을 찾지 못했어."
      );

      return;
    }

    if (
      typeof showScreen !==
      "function"
    ) {
      console.warn(
        "Our Date 위치 애드온: showScreen()을 찾지 못했어."
      );

      return;
    }


    const originalRenderDateMap =
      renderDateMap;

    renderDateMap =
      function () {
        resetLocationForNewMap();

        const result =
          originalRenderDateMap.apply(
            this,
            arguments
          );

        setTimeout(
          activateLocationForRenderedMap,
          0
        );

        return result;
      };


    const originalShowScreen =
      showScreen;

    showScreen =
      function (
        id
      ) {
        if (
          id !==
          "mapScreen"
        ) {
          deactivateMapSensors();
        }

        return originalShowScreen.apply(
          this,
          arguments
        );
      };
  }


  function initializeMapLocationAddon() {
    injectLocationStyles();
    createLocationUi();
    installHooks();
    updateLocationButton();
    updateCompassButton();
  }


  initializeMapLocationAddon();

})();
