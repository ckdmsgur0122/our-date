/*
 * Our Date - Experimental Kakao Map rotation v6
 *
 * v4:
 * - v3's oversized square map canvas remains: no cover-scale drift.
 * - One-finger drag remains geographic-anchor based.
 * - Two-finger rotation + pinch zoom are handled together around
 *   the exact two-finger midpoint.
 * - Kakao's native touch zoom is temporarily disabled during the
 *   custom two-finger gesture to avoid competing gesture engines.
 * - Original Kakao Marker instances are hidden and replaced with a
 *   screen-space marker layer whose POSITION follows the rotated map,
 *   while each marker graphic stays upright relative to the screen.
 *
 * Rollback: replace this file with v3 and change ?v=4 back to ?v=3.
 */

(function () {
  "use strict";

  const WRAPPER_ID =
    "ourDateMapRotationViewport";

  const RESET_BUTTON_ID =
    "ourDateMapRotationReset";

  const ANGLE_LABEL_ID =
    "ourDateMapRotationAngle";

  const MARKER_LAYER_ID =
    "ourDateMapRotatingMarkerLayer";

  const STYLE_ID =
    "ourDateMapCssRotateStylesV4";

  const NORTH_EPSILON_DEG =
    0.35;

  const ROTATION_DEAD_ZONE_DEG =
    0.5;

  const DRAG_START_THRESHOLD_PX =
    3;

  const PINCH_DEAD_ZONE =
    0.018;

  const OVERSCAN_PADDING_PX =
    14;

  const MIN_LEVEL =
    1;

  const MAX_LEVEL =
    14;


  const state = {
    mapElement:
      null,

    wrapper:
      null,

    resetButton:
      null,

    angleLabel:
      null,

    markerLayer:
      null,

    mapInstance:
      null,

    originalDraggable:
      true,

    originalZoomable:
      true,

    rotation:
      0,

    /*
     * Temporary residual scale used only during pinch.
     * At rest this is always 1.
     */
    visualScale:
      1,

    canvasSize:
      0,

    resizeObserver:
      null,

    resizeTimer:
      null,

    /*
     * Custom screen-space markers.
     */
    screenMarkers:
      [],

    mapEventBoundTo:
      null,

    /*
     * One-finger drag.
     */
    dragActive:
      false,

    dragMoved:
      false,

    dragStartClientX:
      0,

    dragStartClientY:
      0,

    dragAnchorLatLng:
      null,

    /*
     * Two-finger gesture.
     */
    gestureActive:
      false,

    gestureStartAngle:
      null,

    gestureStartRotation:
      0,

    gestureStartDistance:
      0,

    gestureStartLevel:
      0,

    gestureCommittedLevel:
      0,

    gestureAnchorLatLng:
      null,

    gestureLastMidpoint:
      null,

    gestureLastDistanceRatio:
      1,

    anchorFrame1:
      null,

    anchorFrame2:
      null,

    resetAnimationFrame:
      null,

    zoomSettleAnimationFrame:
      null
  };


  /* =====================================================
     STYLES
  ===================================================== */

  function injectStyles() {

    if (
      document.getElementById(
        STYLE_ID
      )
    ) {
      return;
    }


    const style =
      document.createElement(
        "style"
      );

    style.id =
      STYLE_ID;

    style.textContent = `
      #${WRAPPER_ID} {
        position: relative;
        width: 100%;
        height: 430px;
        overflow: hidden;
        background: #f2f2f2;
        touch-action: auto;
        contain: paint;
      }

      #${WRAPPER_ID} > #dateMap {
        position: absolute;
        margin: 0;
        transform-origin: 50% 50%;
        transform: rotate(0deg) scale(1);
        will-change: transform;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      #${MARKER_LAYER_ID} {
        position: absolute;
        inset: 0;
        z-index: 55;
        overflow: hidden;
        pointer-events: none;
      }

      .our-date-screen-marker-anchor {
        position: absolute;
        width: 1px;
        height: 1px;
        pointer-events: none;
        will-change: left, top;
      }

      .our-date-screen-marker-rotator {
        position: absolute;
        left: 0;
        top: 0;
        width: 16px;
        height: 21px;

        /*
          Pin tip is the geographic anchor.
          Rotation is around the pin tip.
        */
        transform:
          translate(-50%, -100%)
          rotate(0deg);

        transform-origin: 50% 100%;

        will-change: transform;

        pointer-events: auto;
        cursor: pointer;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .our-date-screen-marker-rotator svg {
        display: block;
        width: 16px;
        height: 21px;
        overflow: visible;
        filter:
          drop-shadow(
            0 1px 2px rgba(0,0,0,0.18)
          );
      }

      .our-date-screen-marker-label {
        position: absolute;

        left: 50%;
        bottom: 24px;

        max-width: 96px;

        overflow: hidden;

        padding:
          3px
          5px;

        transform:
          translateX(-50%);

        border:
          1px solid #fff;

        border-radius:
          5px;

        color: #fff;

        font-size: 6px;
        font-weight: 800;
        line-height: 1.15;

        white-space: nowrap;
        text-overflow: ellipsis;

        box-shadow:
          0 1px 4px
          rgba(0,0,0,0.18);

        pointer-events: none;
      }

      .our-date-screen-marker-label.restaurant {
        background: #e53935;
      }

      .our-date-screen-marker-label.cafe {
        background: #1976d2;
      }

      .our-date-screen-marker-label.activity {
        background: #2e9d50;
      }

      .our-date-screen-marker-rotator:active {
        opacity: 0.82;
      }

      .our-date-map-rotation-ui {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 80;

        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;

        pointer-events: none;
      }

      #${RESET_BUTTON_ID} {
        width: 44px;
        height: 44px;

        display: flex;
        align-items: center;
        justify-content: center;

        padding: 0;

        border:
          1px solid
          rgba(0,0,0,0.13);

        border-radius: 50%;

        background:
          rgba(255,255,255,0.96);

        color: #333;

        box-shadow:
          0 2px 9px
          rgba(0,0,0,0.17);

        pointer-events: auto;

        -webkit-tap-highlight-color:
          transparent;
      }

      #${RESET_BUTTON_ID}:active {
        transform: scale(0.96);
      }

      .our-date-map-north-icon {
        position: relative;
        width: 27px;
        height: 27px;

        display: flex;
        align-items: center;
        justify-content: center;
      }

      .our-date-map-north-letter {
        position: absolute;
        top: -1px;
        left: 50%;

        transform:
          translateX(-50%);

        color: #e54c5e;

        font-size: 10px;
        font-weight: 900;
        line-height: 1;
      }

      .our-date-map-north-arrow {
        position: absolute;
        left: 50%;
        top: 9px;

        width: 0;
        height: 0;

        transform:
          translateX(-50%);

        border-left:
          5px solid transparent;

        border-right:
          5px solid transparent;

        border-bottom:
          14px solid #e54c5e;
      }

      .our-date-map-south-arrow {
        position: absolute;
        left: 50%;
        top: 12px;

        width: 0;
        height: 0;

        transform:
          translateX(-50%);

        border-left:
          5px solid transparent;

        border-right:
          5px solid transparent;

        border-top:
          14px solid #7d7d7d;
      }

      #${ANGLE_LABEL_ID} {
        min-width: 39px;

        padding:
          4px
          7px;

        border-radius:
          999px;

        background:
          rgba(35,35,35,0.76);

        color: white;

        font-size: 10px;
        font-weight: 750;
        line-height: 1.2;
        text-align: center;

        opacity: 0;

        transition:
          opacity
          100ms ease;

        pointer-events: none;
      }

      #${ANGLE_LABEL_ID}.visible {
        opacity: 1;
      }

      @media
      (max-width: 480px) {

        #${WRAPPER_ID} {
          height: 390px;
        }

        .our-date-map-rotation-ui {
          top: 10px;
          right: 10px;
        }

        #${RESET_BUTTON_ID} {
          width: 43px;
          height: 43px;
        }
      }
    `;


    document.head.appendChild(
      style
    );

  }


  function wrapMapElement() {

    const mapElement =
      document.getElementById(
        "dateMap"
      );


    if (!mapElement) {

      console.warn(
        "지도 회전 v6: #dateMap을 찾지 못했어."
      );

      return false;

    }


    const existingWrapper =
      document.getElementById(
        WRAPPER_ID
      );


    if (existingWrapper) {

      state.mapElement =
        mapElement;

      state.wrapper =
        existingWrapper;

      return true;

    }


    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.id =
      WRAPPER_ID;


    mapElement.parentNode.insertBefore(
      wrapper,
      mapElement
    );

    wrapper.appendChild(
      mapElement
    );


    mapElement.classList.remove(
      "date-map"
    );


    state.mapElement =
      mapElement;

    state.wrapper =
      wrapper;


    return true;

  }


  function createMarkerLayer() {

    let layer =
      document.getElementById(
        MARKER_LAYER_ID
      );


    if (!layer) {

      layer =
        document.createElement(
          "div"
        );

      layer.id =
        MARKER_LAYER_ID;

      state.wrapper.appendChild(
        layer
      );

    }


    state.markerLayer =
      layer;

  }


  function createRotationUi() {

    const existingButton =
      document.getElementById(
        RESET_BUTTON_ID
      );


    if (existingButton) {

      state.resetButton =
        existingButton;

      state.angleLabel =
        document.getElementById(
          ANGLE_LABEL_ID
        );

      return;

    }


    const ui =
      document.createElement(
        "div"
      );

    ui.className =
      "our-date-map-rotation-ui";


    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.id =
      RESET_BUTTON_ID;

    button.title =
      "북쪽으로 되돌리기";

    button.setAttribute(
      "aria-label",
      "지도를 북쪽 방향으로 되돌리기"
    );

    button.innerHTML = `
      <span
        class="our-date-map-north-icon"
        aria-hidden="true"
      >
        <span
          class="our-date-map-north-letter"
        >
          N
        </span>

        <span
          class="our-date-map-north-arrow"
        ></span>

        <span
          class="our-date-map-south-arrow"
        ></span>
      </span>
    `;


    const angle =
      document.createElement(
        "div"
      );

    angle.id =
      ANGLE_LABEL_ID;

    angle.textContent =
      "0°";


    ui.appendChild(
      button
    );

    ui.appendChild(
      angle
    );


    state.wrapper.appendChild(
      ui
    );


    state.resetButton =
      button;

    state.angleLabel =
      angle;


    button.addEventListener(
      "click",
      function (
        event
      ) {

        event.stopPropagation();

        resetNorth();

      }
    );

  }


  /* =====================================================
     BASIC MATH
  ===================================================== */

  function degreesToRadians(
    degrees
  ) {

    return (
      degrees
      *
      Math.PI
      /
      180
    );

  }


  function normalizeRotation(
    angle
  ) {

    let value =
      Number(
        angle
      )
      ||
      0;


    value =
      (
        (
          value
          +
          180
        )
        %
        360
        +
        360
      )
      %
      360
      -
      180;


    return value;

  }


  function normalizeDelta(
    angle
  ) {

    return normalizeRotation(
      angle
    );

  }


  function rotateVector(
    x,
    y,
    degrees
  ) {

    const radians =
      degreesToRadians(
        degrees
      );

    const cos =
      Math.cos(
        radians
      );

    const sin =
      Math.sin(
        radians
      );


    return {
      x:
        x
        *
        cos
        -
        y
        *
        sin,

      y:
        x
        *
        sin
        +
        y
        *
        cos
    };

  }


  function getTouchAngle(
    touch1,
    touch2
  ) {

    return (
      Math.atan2(
        touch2.clientY
        -
        touch1.clientY,

        touch2.clientX
        -
        touch1.clientX
      )
      *
      180
      /
      Math.PI
    );

  }


  function getTouchDistance(
    touch1,
    touch2
  ) {

    return Math.hypot(
      touch2.clientX
      -
      touch1.clientX,

      touch2.clientY
      -
      touch1.clientY
    );

  }


  function getTouchMidpoint(
    touch1,
    touch2
  ) {

    return {
      clientX:
        (
          touch1.clientX
          +
          touch2.clientX
        )
        /
        2,

      clientY:
        (
          touch1.clientY
          +
          touch2.clientY
        )
        /
        2
    };

  }


  function clamp(
    value,
    minimum,
    maximum
  ) {

    return Math.min(
      maximum,
      Math.max(
        minimum,
        value
      )
    );

  }


  /* =====================================================
     OVERSIZED MAP CANVAS
  ===================================================== */

  function updateOverscanGeometry(
    preserveCenter = true
  ) {

    if (
      !state.wrapper
      ||
      !state.mapElement
    ) {
      return;
    }


    const width =
      state.wrapper.clientWidth;

    const height =
      state.wrapper.clientHeight;


    if (
      !width
      ||
      !height
    ) {
      return;
    }


    const diagonal =
      Math.ceil(
        Math.hypot(
          width,
          height
        )
        +
        OVERSCAN_PADDING_PX
      );


    if (
      diagonal ===
      state.canvasSize
    ) {
      return;
    }


    const map =
      syncMapInstance();


    let center =
      null;


    if (
      preserveCenter
      &&
      map
      &&
      typeof map.getCenter ===
        "function"
    ) {

      center =
        map.getCenter();

    }


    state.canvasSize =
      diagonal;


    state.mapElement.style.width =
      diagonal
      +
      "px";

    state.mapElement.style.height =
      diagonal
      +
      "px";

    state.mapElement.style.left =
      (
        (
          width
          -
          diagonal
        )
        /
        2
      )
      +
      "px";

    state.mapElement.style.top =
      (
        (
          height
          -
          diagonal
        )
        /
        2
      )
      +
      "px";


    if (
      map
      &&
      typeof map.relayout ===
        "function"
    ) {

      map.relayout();


      if (
        center
        &&
        typeof map.setCenter ===
          "function"
      ) {

        map.setCenter(
          center
        );

      }

    }


    renderScreenMarkers();

  }


  function attachResizeObserver() {

    if (
      typeof ResizeObserver ===
      "function"
    ) {

      state.resizeObserver =
        new ResizeObserver(
          function () {

            clearTimeout(
              state.resizeTimer
            );


            state.resizeTimer =
              setTimeout(
                function () {

                  updateOverscanGeometry(
                    true
                  );

                },
                40
              );

          }
        );


      state.resizeObserver.observe(
        state.wrapper
      );

    }
    else {

      window.addEventListener(
        "resize",
        function () {

          clearTimeout(
            state.resizeTimer
          );


          state.resizeTimer =
            setTimeout(
              function () {

                updateOverscanGeometry(
                  true
                );

              },
              60
            );

        }
      );

    }

  }


  /* =====================================================
     MAP TRANSFORM
  ===================================================== */

  function updateRotationUi() {

    if (
      !state.resetButton
      ||
      !state.angleLabel
    ) {
      return;
    }


    const isNorth =
      Math.abs(
        state.rotation
      )
      <
      NORTH_EPSILON_DEG;


    state.resetButton.style.opacity =
      isNorth
      ?
      "0.82"
      :
      "1";


    state.angleLabel.textContent =
      Math.round(
        state.rotation
      )
      +
      "°";


    state.angleLabel.classList.toggle(
      "visible",
      !isNorth
    );

  }


  function renderMapTransform() {

    if (!state.mapElement) {
      return;
    }


    state.mapElement.style.transform =
      "rotate("
      +
      state.rotation
      +
      "deg) "
      +
      "scale("
      +
      state.visualScale
      +
      ")";


    updateRotationUi();

    renderScreenMarkers();

  }


  function setRotation(
    rotation
  ) {

    state.rotation =
      normalizeRotation(
        rotation
      );


    renderMapTransform();

  }


  function setVisualScale(
    scale
  ) {

    state.visualScale =
      Number.isFinite(
        scale
      )
      ?
      Math.max(
        0.55,
        Math.min(
          1.8,
          scale
        )
      )
      :
      1;


    renderMapTransform();

  }


  /* =====================================================
     KAKAO MAP HELPERS
  ===================================================== */

  function getMapInstance() {

    try {

      if (
        typeof dateMap !==
        "undefined"
        &&
        dateMap
      ) {

        return dateMap;

      }

    }
    catch (
      error
    ) {
      /*
        dateMap may not be initialized yet.
      */
    }


    return null;

  }


  function syncMapInstance() {

    const map =
      getMapInstance();


    if (!map) {
      return null;
    }


    if (
      state.mapInstance !==
      map
    ) {

      state.mapInstance =
        map;


      if (
        typeof map.getDraggable ===
        "function"
      ) {

        state.originalDraggable =
          map.getDraggable();

      }
      else {

        state.originalDraggable =
          true;

      }


      if (
        typeof map.getZoomable ===
        "function"
      ) {

        state.originalZoomable =
          map.getZoomable();

      }
      else {

        state.originalZoomable =
          true;

      }

    }


    return map;

  }


  function setNativeDraggable(
    enabled
  ) {

    const map =
      syncMapInstance();


    if (
      map
      &&
      typeof map.setDraggable ===
        "function"
    ) {

      map.setDraggable(
        Boolean(
          enabled
        )
      );

    }

  }


  function setNativeZoomable(
    enabled
  ) {

    const map =
      syncMapInstance();


    if (
      map
      &&
      typeof map.setZoomable ===
        "function"
    ) {

      map.setZoomable(
        Boolean(
          enabled
        )
      );

    }

  }


  function restoreNativeInteraction() {

    const north =
      Math.abs(
        state.rotation
      )
      <
      NORTH_EPSILON_DEG;


    if (north) {

      setNativeDraggable(
        state.originalDraggable
      );

    }
    else {

      setNativeDraggable(
        false
      );

    }


    if (
      !state.gestureActive
    ) {

      setNativeZoomable(
        state.originalZoomable
      );

    }

  }


  function clientPointToUnderlyingContainerPoint(
    clientX,
    clientY
  ) {

    const rect =
      state.wrapper
        .getBoundingClientRect();


    const wrapperCenterX =
      rect.left
      +
      rect.width
      /
      2;

    const wrapperCenterY =
      rect.top
      +
      rect.height
      /
      2;


    const screenVectorX =
      (
        clientX
        -
        wrapperCenterX
      )
      /
      state.visualScale;

    const screenVectorY =
      (
        clientY
        -
        wrapperCenterY
      )
      /
      state.visualScale;


    const underlyingVector =
      rotateVector(
        screenVectorX,
        screenVectorY,
        -state.rotation
      );


    const mapWidth =
      state.mapElement.clientWidth;

    const mapHeight =
      state.mapElement.clientHeight;


    return new kakao.maps.Point(
      mapWidth
      /
      2
      +
      underlyingVector.x,

      mapHeight
      /
      2
      +
      underlyingVector.y
    );

  }


  function latLngAtClientPoint(
    clientX,
    clientY
  ) {

    const map =
      syncMapInstance();


    if (!map) {
      return null;
    }


    const projection =
      map.getProjection();


    const point =
      clientPointToUnderlyingContainerPoint(
        clientX,
        clientY
      );


    return projection
      .coordsFromContainerPoint(
        point
      );

  }


  function keepLatLngAtClientPoint(
    latLng,
    clientX,
    clientY
  ) {

    const map =
      syncMapInstance();


    if (
      !map
      ||
      !latLng
    ) {
      return;
    }


    const projection =
      map.getProjection();


    const desiredPoint =
      clientPointToUnderlyingContainerPoint(
        clientX,
        clientY
      );


    const currentPoint =
      projection
        .containerPointFromCoords(
          latLng
        );


    const currentCenter =
      map.getCenter();


    const currentCenterPoint =
      projection
        .containerPointFromCoords(
          currentCenter
        );


    const deltaX =
      currentPoint.x
      -
      desiredPoint.x;

    const deltaY =
      currentPoint.y
      -
      desiredPoint.y;


    if (
      Math.abs(
        deltaX
      )
      <
      0.02
      &&
      Math.abs(
        deltaY
      )
      <
      0.02
    ) {
      return;
    }


    const newCenterPoint =
      new kakao.maps.Point(
        currentCenterPoint.x
        +
        deltaX,

        currentCenterPoint.y
        +
        deltaY
      );


    const newCenter =
      projection
        .coordsFromContainerPoint(
          newCenterPoint
        );


    map.setCenter(
      newCenter
    );

  }


  function scheduleAnchorCorrection(
    latLng,
    clientX,
    clientY
  ) {

    cancelAnimationFrame(
      state.anchorFrame1
    );

    cancelAnimationFrame(
      state.anchorFrame2
    );


    state.anchorFrame1 =
      requestAnimationFrame(
        function () {

          keepLatLngAtClientPoint(
            latLng,
            clientX,
            clientY
          );


          renderScreenMarkers();


          state.anchorFrame2 =
            requestAnimationFrame(
              function () {

                keepLatLngAtClientPoint(
                  latLng,
                  clientX,
                  clientY
                );


                renderScreenMarkers();

              }
            );

        }
      );

  }


  /* =====================================================
     SCREEN-SPACE ROTATING MARKERS
  ===================================================== */

  function getMarkerColor(
    category
  ) {

    try {

      if (
        typeof getDateMapCategoryColor ===
        "function"
      ) {

        return getDateMapCategoryColor(
          category
        );

      }

    }
    catch (
      error
    ) {}


    if (
      category ===
      "restaurant"
    ) {

      return "#e53935";

    }


    if (
      category ===
      "cafe"
    ) {

      return "#1976d2";

    }


    return "#2e9d50";

  }


  function makeMarkerSvg(
    color
  ) {

    return `
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="21"
        viewBox="0 0 32 42"
        aria-hidden="true"
      >
        <path
          d="M16 1C7.72 1 1 7.72 1 16c0 10.8 15 25 15 25s15-14.2 15-25C31 7.72 24.28 1 16 1z"
          fill="${color}"
          stroke="#ffffff"
          stroke-width="2"
        />
        <circle
          cx="16"
          cy="15.5"
          r="5.2"
          fill="#ffffff"
        />
      </svg>
    `;

  }


  function clearScreenMarkers() {

    state.screenMarkers.forEach(
      function (
        item
      ) {

        if (
          item.anchor
          &&
          item.anchor.parentNode
        ) {

          item.anchor.parentNode.removeChild(
            item.anchor
          );

        }

      }
    );


    state.screenMarkers =
      [];


    if (
      state.markerLayer
    ) {

      state.markerLayer.innerHTML =
        "";

    }

  }


  function getMarkerEntries() {

    try {

      if (
        typeof dateMapMarkerEntries !==
        "undefined"
        &&
        dateMapMarkerEntries
      ) {

        return Object.values(
          dateMapMarkerEntries
        );

      }

    }
    catch (
      error
    ) {}


    return [];

  }


  function rebuildScreenMarkers() {

    clearScreenMarkers();


    if (
      !state.markerLayer
    ) {
      return;
    }


    const entries =
      getMarkerEntries();


    entries.forEach(
      function (
        entry
      ) {

        if (
          !entry
          ||
          !entry.position
        ) {
          return;
        }


        /*
          Hide the Kakao-rendered marker itself.
          We keep the Marker object alive for the app's existing data
          and info-window logic.
        */
        if (
          entry.marker
          &&
          typeof entry.marker.setVisible ===
            "function"
        ) {

          entry.marker.setVisible(
            false
          );

        }


        /*
          Original Kakao name label lives inside the rotated map,
          so hide it and render a smaller upright screen-space label
          next to our custom pin instead.
        */
        if (
          entry.nameOverlay
          &&
          typeof entry.nameOverlay.setMap ===
            "function"
        ) {

          entry.nameOverlay.setMap(
            null
          );

        }


        const anchor =
          document.createElement(
            "div"
          );

        anchor.className =
          "our-date-screen-marker-anchor";


        const rotator =
          document.createElement(
            "div"
          );

        rotator.className =
          "our-date-screen-marker-rotator";

        rotator.setAttribute(
          "role",
          "button"
        );

        rotator.setAttribute(
          "aria-label",
          entry.place
          &&
          entry.place.name
          ?
          entry.place.name
          :
          "지도 장소"
        );

        rotator.innerHTML =
          makeMarkerSvg(
            getMarkerColor(
              entry.place
              ?
              entry.place.category
              :
              ""
            )
          );


        const label =
          document.createElement(
            "div"
          );

        label.className =
          "our-date-screen-marker-label "
          +
          (
            entry.place
            &&
            entry.place.category
            ?
            entry.place.category
            :
            "activity"
          );

        label.textContent =
          entry.place
          &&
          entry.place.name
          ?
          entry.place.name
          :
          "";


        rotator.addEventListener(
          "click",
          function (
            event
          ) {

            event.stopPropagation();


            if (
              entry.place
              &&
              typeof showDateMapPlaceInfo ===
                "function"
            ) {

              showDateMapPlaceInfo(
                entry.place
              );

            }

          }
        );


        anchor.appendChild(
          label
        );

        anchor.appendChild(
          rotator
        );

        state.markerLayer.appendChild(
          anchor
        );


        state.screenMarkers.push({
          entry:
            entry,

          anchor:
            anchor,

          rotator:
            rotator,

          label:
            label
        });

      }
    );


    renderScreenMarkers();

  }


  function nativeContainerPointToScreen(
    point
  ) {

    const rect =
      state.wrapper
        .getBoundingClientRect();


    const mapWidth =
      state.mapElement.clientWidth;

    const mapHeight =
      state.mapElement.clientHeight;


    const nativeX =
      point.x
      -
      mapWidth
      /
      2;

    const nativeY =
      point.y
      -
      mapHeight
      /
      2;


    /*
      Apply the same temporary pinch scale and rotation as the map.
    */
    const scaledX =
      nativeX
      *
      state.visualScale;

    const scaledY =
      nativeY
      *
      state.visualScale;


    const rotated =
      rotateVector(
        scaledX,
        scaledY,
        state.rotation
      );


    return {
      x:
        rect.width
        /
        2
        +
        rotated.x,

      y:
        rect.height
        /
        2
        +
        rotated.y
    };

  }


  function renderScreenMarkers() {

    const map =
      syncMapInstance();


    if (
      !map
      ||
      !state.markerLayer
      ||
      state.screenMarkers.length ===
        0
    ) {
      return;
    }


    const projection =
      map.getProjection();


    const wrapperWidth =
      state.wrapper.clientWidth;

    const wrapperHeight =
      state.wrapper.clientHeight;


    state.screenMarkers.forEach(
      function (
        item
      ) {

        const point =
          projection
            .containerPointFromCoords(
              item.entry.position
            );


        const screen =
          nativeContainerPointToScreen(
            point
          );


        /*
          Generous margin so a pin does not blink at the exact edge.
        */
        const visible =
          screen.x >
            -45
          &&
          screen.x <
            wrapperWidth
            +
            45
          &&
          screen.y >
            -45
          &&
          screen.y <
            wrapperHeight
            +
            45;


        item.anchor.style.display =
          visible
          ?
          "block"
          :
          "none";


        if (!visible) {
          return;
        }


        item.anchor.style.left =
          screen.x
          +
          "px";

        item.anchor.style.top =
          screen.y
          +
          "px";


        /*
          Marker and compact place-name label positions follow
          the rotated/zoomed map, while both graphics stay upright
          relative to the screen.
        */
        item.rotator.style.transform =
          "translate(-50%, -100%) rotate(0deg)";

      }
    );

  }


  function overrideInfoWindowAnchor() {

    /*
      The original app opens InfoWindow against entry.marker.
      v4 hides that marker, so use the entry LatLng directly.
    */
    try {

      if (
        typeof showDateMapPlaceInfo !==
        "function"
        ||
        showDateMapPlaceInfo
          .__ourDateRotationV6Wrapped
      ) {
        return;
      }


      const replacement =
        function (
          place
        ) {

          if (
            !dateMap
            ||
            !dateMapInfoWindow
          ) {
            return;
          }


          const entry =
            dateMapMarkerEntries[
              getDateMapPlaceKey(
                place
              )
            ];


          if (!entry) {
            return;
          }


          dateMapInfoWindow.setContent(
            makeDateMapInfoContent(
              place
            )
          );


          if (
            typeof dateMapInfoWindow.setPosition ===
            "function"
          ) {

            dateMapInfoWindow.setPosition(
              entry.position
            );

          }


          dateMapInfoWindow.open(
            dateMap
          );

        };


      replacement.__ourDateRotationV6Wrapped =
        true;


      showDateMapPlaceInfo =
        replacement;

    }
    catch (
      error
    ) {

      console.warn(
        "지도 회전 v6: 인포윈도우 앵커 보정 생략",
        error
      );

    }

  }


  function bindMapMarkerEvents() {

    const map =
      syncMapInstance();


    if (
      !map
      ||
      state.mapEventBoundTo ===
        map
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


    state.mapEventBoundTo =
      map;


    [
      "center_changed",
      "zoom_changed",
      "bounds_changed",
      "idle",
      "tilesloaded"
    ]
      .forEach(
        function (
          eventName
        ) {

          kakao.maps.event.addListener(
            map,
            eventName,
            function () {

              requestAnimationFrame(
                renderScreenMarkers
              );

            }
          );

        }
      );

  }


  /* =====================================================
     ONE-FINGER DRAG
  ===================================================== */

  function startOneFingerDrag(
    touch
  ) {

    state.dragActive =
      true;

    state.dragMoved =
      false;

    state.dragStartClientX =
      touch.clientX;

    state.dragStartClientY =
      touch.clientY;


    state.dragAnchorLatLng =
      latLngAtClientPoint(
        touch.clientX,
        touch.clientY
      );

  }


  function updateOneFingerDrag(
    event,
    touch
  ) {

    if (
      !state.dragActive
      ||
      !state.dragAnchorLatLng
    ) {
      return;
    }


    const totalDx =
      touch.clientX
      -
      state.dragStartClientX;

    const totalDy =
      touch.clientY
      -
      state.dragStartClientY;


    if (
      !state.dragMoved
      &&
      Math.hypot(
        totalDx,
        totalDy
      )
      <
      DRAG_START_THRESHOLD_PX
    ) {
      return;
    }


    state.dragMoved =
      true;


    if (
      event.cancelable
    ) {

      event.preventDefault();

    }


    keepLatLngAtClientPoint(
      state.dragAnchorLatLng,
      touch.clientX,
      touch.clientY
    );


    renderScreenMarkers();

  }


  function stopOneFingerDrag() {

    state.dragActive =
      false;

    state.dragMoved =
      false;

    state.dragAnchorLatLng =
      null;

  }


  /* =====================================================
     TWO-FINGER ROTATE + PINCH
  ===================================================== */

  function startTwoFingerGesture(
    touch1,
    touch2
  ) {

    const map =
      syncMapInstance();


    if (!map) {
      return;
    }


    stopOneFingerDrag();


    /*
      We own both movement and zoom during this gesture.
      Programmatic setLevel still works while setZoomable(false).
    */
    setNativeDraggable(
      false
    );

    setNativeZoomable(
      false
    );


    const midpoint =
      getTouchMidpoint(
        touch1,
        touch2
      );


    state.gestureActive =
      true;

    state.gestureStartAngle =
      getTouchAngle(
        touch1,
        touch2
      );

    state.gestureStartRotation =
      state.rotation;

    state.gestureStartDistance =
      Math.max(
        1,
        getTouchDistance(
          touch1,
          touch2
        )
      );

    state.gestureStartLevel =
      map.getLevel();

    state.gestureCommittedLevel =
      state.gestureStartLevel;

    state.gestureLastDistanceRatio =
      1;

    state.gestureLastMidpoint =
      midpoint;


    state.gestureAnchorLatLng =
      latLngAtClientPoint(
        midpoint.clientX,
        midpoint.clientY
      );


    /*
      Start every new pinch from a committed tile level.
    */
    state.visualScale =
      1;

    renderMapTransform();

  }


  function applyPinchZoom(
    distanceRatio
  ) {

    const map =
      syncMapInstance();


    if (
      !map
      ||
      !state.gestureAnchorLatLng
    ) {
      return;
    }


    const safeRatio =
      Math.max(
        0.35,
        Math.min(
          3,
          distanceRatio
        )
      );


    /*
      Each Kakao level is approximately a factor-of-two map scale.
      Continuous desired level:
        L = L_start - log2(fingerDistanceRatio)
    */
    const desiredLevelFloat =
      state.gestureStartLevel
      -
      Math.log2(
        safeRatio
      );


    const targetLevel =
      clamp(
        Math.round(
          desiredLevelFloat
        ),
        MIN_LEVEL,
        MAX_LEVEL
      );


    if (
      targetLevel !==
      state.gestureCommittedLevel
    ) {

      state.gestureCommittedLevel =
        targetLevel;


      map.setLevel(
        targetLevel,
        {
          anchor:
            state.gestureAnchorLatLng
        }
      );

    }


    /*
      Kakao levels are discrete. Keep the gesture visually continuous
      with a small residual CSS scale between integer level changes.

      base scale created by committed Kakao level:
        2^(L_start - L_committed)

      residual CSS scale:
        fingerRatio / baseScale
    */
    const baseScale =
      Math.pow(
        2,
        state.gestureStartLevel
        -
        state.gestureCommittedLevel
      );


    let residualScale =
      safeRatio
      /
      baseScale;


    /*
      At min/max level we cannot commit further map levels, so avoid
      allowing an extreme temporary CSS zoom.
    */
    residualScale =
      clamp(
        residualScale,
        0.72,
        1.38
      );


    if (
      Math.abs(
        residualScale
        -
        1
      )
      <
      PINCH_DEAD_ZONE
    ) {

      residualScale =
        1;

    }


    state.visualScale =
      residualScale;

  }


  function updateTwoFingerGesture(
    event,
    touch1,
    touch2
  ) {

    if (
      !state.gestureActive
      ||
      state.gestureStartAngle ===
        null
    ) {
      return;
    }


    /*
      Stop the browser / Kakao native gesture engine from applying a
      second zoom underneath ours.
    */
    if (
      event.cancelable
    ) {

      event.preventDefault();

    }


    const currentAngle =
      getTouchAngle(
        touch1,
        touch2
      );


    const angleDelta =
      normalizeDelta(
        currentAngle
        -
        state.gestureStartAngle
      );


    let newRotation =
      state.gestureStartRotation;


    if (
      Math.abs(
        angleDelta
      )
      >=
      ROTATION_DEAD_ZONE_DEG
    ) {

      newRotation =
        state.gestureStartRotation
        +
        angleDelta;

    }


    state.rotation =
      normalizeRotation(
        newRotation
      );


    const currentDistance =
      Math.max(
        1,
        getTouchDistance(
          touch1,
          touch2
        )
      );


    const distanceRatio =
      currentDistance
      /
      state.gestureStartDistance;


    state.gestureLastDistanceRatio =
      distanceRatio;


    applyPinchZoom(
      distanceRatio
    );


    const midpoint =
      getTouchMidpoint(
        touch1,
        touch2
      );


    state.gestureLastMidpoint =
      midpoint;


    renderMapTransform();


    if (
      state.gestureAnchorLatLng
    ) {

      /*
        The geographic point initially under the midpoint stays under
        the CURRENT midpoint while rotating, zooming, and translating
        the two-finger gesture together.
      */
      keepLatLngAtClientPoint(
        state.gestureAnchorLatLng,
        midpoint.clientX,
        midpoint.clientY
      );


      scheduleAnchorCorrection(
        state.gestureAnchorLatLng,
        midpoint.clientX,
        midpoint.clientY
      );

    }

  }


  function settleVisualZoom(
    anchorLatLng,
    midpoint
  ) {

    cancelAnimationFrame(
      state.zoomSettleAnimationFrame
    );


    const startingScale =
      state.visualScale;


    if (
      Math.abs(
        startingScale
        -
        1
      )
      <
      0.005
    ) {

      state.visualScale =
        1;

      renderMapTransform();

      return;

    }


    const duration =
      110;

    const startTime =
      performance.now();


    function animate(
      now
    ) {

      const t =
        Math.min(
          1,
          (
            now
            -
            startTime
          )
          /
          duration
        );


      const eased =
        1
        -
        Math.pow(
          1
          -
          t,
          3
        );


      state.visualScale =
        startingScale
        +
        (
          1
          -
          startingScale
        )
        *
        eased;


      renderMapTransform();


      if (
        anchorLatLng
        &&
        midpoint
      ) {

        keepLatLngAtClientPoint(
          anchorLatLng,
          midpoint.clientX,
          midpoint.clientY
        );

      }


      if (
        t <
        1
      ) {

        state.zoomSettleAnimationFrame =
          requestAnimationFrame(
            animate
          );

      }
      else {

        state.visualScale =
          1;

        renderMapTransform();

      }

    }


    state.zoomSettleAnimationFrame =
      requestAnimationFrame(
        animate
      );

  }


  function stopTwoFingerGesture() {

    const finalAnchor =
      state.gestureAnchorLatLng;

    const finalMidpoint =
      state.gestureLastMidpoint;


    state.gestureActive =
      false;

    state.gestureStartAngle =
      null;

    state.gestureStartRotation =
      state.rotation;

    state.gestureStartDistance =
      0;

    state.gestureStartLevel =
      0;

    state.gestureCommittedLevel =
      0;

    state.gestureAnchorLatLng =
      null;

    state.gestureLastMidpoint =
      null;

    state.gestureLastDistanceRatio =
      1;


    settleVisualZoom(
      finalAnchor,
      finalMidpoint
    );


    restoreNativeInteraction();

  }


  /* =====================================================
     TOUCH ROUTER
  ===================================================== */

  function onTouchStart(
    event
  ) {

    const count =
      event.touches.length;


    if (
      count >=
      2
    ) {

      startTwoFingerGesture(
        event.touches[0],
        event.touches[1]
      );

      return;

    }


    if (
      count ===
      1
      &&
      Math.abs(
        state.rotation
      )
      >=
      NORTH_EPSILON_DEG
    ) {

      setNativeDraggable(
        false
      );


      startOneFingerDrag(
        event.touches[0]
      );

    }

  }


  function onTouchMove(
    event
  ) {

    const count =
      event.touches.length;


    if (
      count >=
      2
    ) {

      if (
        !state.gestureActive
      ) {

        startTwoFingerGesture(
          event.touches[0],
          event.touches[1]
        );

      }


      updateTwoFingerGesture(
        event,
        event.touches[0],
        event.touches[1]
      );

      return;

    }


    if (
      count ===
      1
      &&
      !state.gestureActive
      &&
      Math.abs(
        state.rotation
      )
      >=
      NORTH_EPSILON_DEG
    ) {

      if (
        !state.dragActive
      ) {

        startOneFingerDrag(
          event.touches[0]
        );

      }


      updateOneFingerDrag(
        event,
        event.touches[0]
      );

    }

  }


  function onTouchEnd(
    event
  ) {

    const count =
      event.touches.length;


    if (
      state.gestureActive
      &&
      count <
      2
    ) {

      stopTwoFingerGesture();


      if (
        count ===
        1
        &&
        Math.abs(
          state.rotation
        )
        >=
        NORTH_EPSILON_DEG
      ) {

        setNativeDraggable(
          false
        );


        startOneFingerDrag(
          event.touches[0]
        );

      }


      return;

    }


    if (
      count ===
      0
    ) {

      stopOneFingerDrag();

      restoreNativeInteraction();

    }

  }


  function onTouchCancel() {

    stopOneFingerDrag();


    if (
      state.gestureActive
    ) {

      stopTwoFingerGesture();

    }


    restoreNativeInteraction();

  }


  /* =====================================================
     NORTH RESET
  ===================================================== */

  function resetNorth() {

    cancelAnimationFrame(
      state.resetAnimationFrame
    );


    const startRotation =
      state.rotation;

    const duration =
      220;

    const startTime =
      performance.now();


    function animate(
      now
    ) {

      const t =
        Math.min(
          1,
          (
            now
            -
            startTime
          )
          /
          duration
        );


      const eased =
        1
        -
        Math.pow(
          1
          -
          t,
          3
        );


      state.rotation =
        normalizeRotation(
          startRotation
          *
          (
            1
            -
            eased
          )
        );


      renderMapTransform();


      if (
        t <
        1
      ) {

        state.resetAnimationFrame =
          requestAnimationFrame(
            animate
          );

      }
      else {

        state.rotation =
          0;

        state.visualScale =
          1;

        renderMapTransform();

        restoreNativeInteraction();

      }

    }


    state.resetAnimationFrame =
      requestAnimationFrame(
        animate
      );

  }


  /* =====================================================
     MAP LIFECYCLE
  ===================================================== */

  function configureCurrentMap() {

    const map =
      syncMapInstance();


    if (!map) {
      return;
    }


    updateOverscanGeometry(
      true
    );


    bindMapMarkerEvents();

    overrideInfoWindowAnchor();

    rebuildScreenMarkers();

    restoreNativeInteraction();

  }


  function hookRenderDateMap() {

    if (
      typeof renderDateMap !==
      "function"
    ) {
      return;
    }


    if (
      renderDateMap
        .__ourDateRotationV6Wrapped
    ) {
      return;
    }


    const original =
      renderDateMap;


    const wrapped =
      function () {

        /*
          Remove screen markers from the previous Kakao map instance
          before the app creates a new one.
        */
        clearScreenMarkers();


        const result =
          original.apply(
            this,
            arguments
          );


        setTimeout(
          configureCurrentMap,
          0
        );


        return result;

      };


    wrapped.__ourDateRotationV6Wrapped =
      true;


    renderDateMap =
      wrapped;

  }


  /* =====================================================
     LISTENERS
  ===================================================== */

  function attachTouchListeners() {

    state.wrapper.addEventListener(
      "touchstart",
      onTouchStart,
      {
        capture:
          true,

        passive:
          true
      }
    );


    state.wrapper.addEventListener(
      "touchmove",
      onTouchMove,
      {
        capture:
          true,

        passive:
          false
      }
    );


    state.wrapper.addEventListener(
      "touchend",
      onTouchEnd,
      {
        capture:
          true,

        passive:
          true
      }
    );


    state.wrapper.addEventListener(
      "touchcancel",
      onTouchCancel,
      {
        capture:
          true,

        passive:
          true
      }
    );

  }


  function attachDesktopTestSupport() {

    state.wrapper.addEventListener(
      "wheel",
      function (
        event
      ) {

        if (
          !event.shiftKey
        ) {
          return;
        }


        event.preventDefault();


        const direction =
          event.deltaY > 0
          ?
          1
          :
          -1;


        state.rotation =
          normalizeRotation(
            state.rotation
            +
            direction
            *
            5
          );


        renderMapTransform();

        restoreNativeInteraction();

      },
      {
        passive:
          false
      }
    );

  }


  /* =====================================================
     INITIALIZE
  ===================================================== */

  function initialize() {

    injectStyles();


    if (
      !wrapMapElement()
    ) {
      return;
    }


    createMarkerLayer();

    createRotationUi();


    updateOverscanGeometry(
      false
    );


    attachResizeObserver();

    attachTouchListeners();

    attachDesktopTestSupport();

    hookRenderDateMap();


    state.rotation =
      0;

    state.visualScale =
      1;

    renderMapTransform();


    setTimeout(
      configureCurrentMap,
      0
    );


    window.ourDateMapRotation = {

      set:
        function (
          angle
        ) {

          state.rotation =
            normalizeRotation(
              angle
            );

          state.visualScale =
            1;

          renderMapTransform();

          restoreNativeInteraction();

        },

      reset:
        resetNorth,

      get:
        function () {

          return state.rotation;

        },

      getCanvasSize:
        function () {

          return state.canvasSize;

        },

      rebuildMarkers:
        rebuildScreenMarkers

    };

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      {
        once:
          true
      }
    );

  }
  else {

    initialize();

  }

})();
