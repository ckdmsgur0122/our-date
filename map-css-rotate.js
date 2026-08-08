/*
 * Our Date - Experimental Kakao Map CSS rotation v3
 *
 * v3 changes:
 * - No dynamic CSS scale while rotating.
 * - The Kakao map canvas is oversized to a square whose side is
 *   slightly larger than the visible viewport diagonal, preventing
 *   blank corners at every rotation angle.
 * - Two-finger rotation keeps the geographic point under the
 *   two-finger midpoint pinned to that midpoint.
 * - One-finger drag in a rotated map uses a geographic anchor
 *   captured at drag start instead of accumulating tiny per-frame
 *   pixel deltas. This greatly reduces drift on long drags.
 *
 * This is still an experimental CSS rotation layer, not a native
 * Kakao Maps bearing/heading implementation.
 */

(function () {
  "use strict";

  const WRAPPER_ID =
    "ourDateMapRotationViewport";

  const RESET_BUTTON_ID =
    "ourDateMapRotationReset";

  const ANGLE_LABEL_ID =
    "ourDateMapRotationAngle";

  const STYLE_ID =
    "ourDateMapCssRotateStylesV3";

  const NORTH_EPSILON_DEG =
    0.35;

  const ROTATION_DEAD_ZONE_DEG =
    0.55;

  const DRAG_START_THRESHOLD_PX =
    3;

  /*
   * A few extra pixels beyond the exact diagonal prevent one-pixel
   * seams caused by browser subpixel rounding / antialiasing.
   */
  const OVERSCAN_PADDING_PX =
    12;


  const state = {
    mapElement:
      null,

    wrapper:
      null,

    resetButton:
      null,

    angleLabel:
      null,

    mapInstance:
      null,

    originalDraggable:
      true,

    rotation:
      0,

    /*
     * Current oversized Kakao map canvas dimensions.
     */
    canvasSize:
      0,

    resizeObserver:
      null,

    resizeTimer:
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
     * Two-finger rotation / pinch.
     */
    gestureActive:
      false,

    gestureStartAngle:
      null,

    gestureStartRotation:
      0,

    gestureAnchorLatLng:
      null,

    gestureLastMidpoint:
      null,

    /*
     * A couple of post-frame corrections are useful because Kakao
     * may apply native pinch zoom after our touch handler returns.
     */
    anchorFrame1:
      null,

    anchorFrame2:
      null,

    /*
     * North reset animation.
     */
    resetAnimationFrame:
      null
  };


  /* =====================================================
     STYLES / DOM
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

        /*
          JS sets the real width/height/left/top so the map canvas
          is a large centered square.
        */
        margin: 0;

        transform-origin: 50% 50%;

        transform:
          rotate(0deg);

        will-change: transform;

        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
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
        "지도 회전 v3: #dateMap을 찾지 못했어."
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


    /*
      The wrapper now owns the visible map size.
      The Kakao map element becomes an oversized square.
    */
    mapElement.classList.remove(
      "date-map"
    );


    state.mapElement =
      mapElement;

    state.wrapper =
      wrapper;


    return true;

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
     CSS ROTATION
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


  function renderRotation(
    rotation
  ) {

    if (!state.mapElement) {
      return;
    }


    state.rotation =
      normalizeRotation(
        rotation
      );


    /*
      v3 intentionally uses rotation only.
      No angle-dependent scale means an off-center pivot does not
      acquire extra nonlinear drift as the angle changes.
    */
    state.mapElement.style.transform =
      "rotate("
      +
      state.rotation
      +
      "deg)";


    updateRotationUi();

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

    }


    return map;

  }


  function setNativeDraggable(
    enabled
  ) {

    const map =
      syncMapInstance();


    if (
      !map
      ||
      typeof map.setDraggable !==
        "function"
    ) {
      return;
    }


    map.setDraggable(
      Boolean(
        enabled
      )
    );

  }


  function restoreNativeDragIfPossible() {

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

      /*
        In a rotated view, Kakao's native drag direction no longer
        matches the screen direction. Use our anchored drag instead.
      */
      setNativeDraggable(
        false
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


    /*
      Screen vector measured from the visible viewport center.
    */
    const screenVectorX =
      clientX
      -
      wrapperCenterX;

    const screenVectorY =
      clientY
      -
      wrapperCenterY;


    /*
      Undo the CSS rotation to get the native Kakao-map direction.
      There is no scale to undo in v3.
    */
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


    /*
      If the geographic anchor is currently at P_current and we need
      it at P_desired, move the map center by:
          P_current - P_desired
      in native map pixel coordinates.
    */
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


          state.anchorFrame2 =
            requestAnimationFrame(
              function () {

                keepLatLngAtClientPoint(
                  latLng,
                  clientX,
                  clientY
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


    /*
      Important v3 change:
      Save the real geographic point directly below the finger.
      Every subsequent move asks:
      "Where should the map center be so this exact LatLng is still
       directly under the finger?"

      This is absolute anchoring, not incremental delta accumulation.
    */
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
     TWO-FINGER ROTATION / PINCH
  ===================================================== */

  function startTwoFingerGesture(
    touch1,
    touch2
  ) {

    stopOneFingerDrag();


    setNativeDraggable(
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

    state.gestureLastMidpoint =
      midpoint;


    /*
      Capture the geographic coordinate under the exact two-finger
      midpoint. This remains the gesture pivot even near the viewport
      edge.
    */
    state.gestureAnchorLatLng =
      latLngAtClientPoint(
        midpoint.clientX,
        midpoint.clientY
      );

  }


  function updateTwoFingerGesture(
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


    const currentAngle =
      getTouchAngle(
        touch1,
        touch2
      );


    const delta =
      normalizeDelta(
        currentAngle
        -
        state.gestureStartAngle
      );


    const midpoint =
      getTouchMidpoint(
        touch1,
        touch2
      );


    let newRotation =
      state.gestureStartRotation;


    if (
      Math.abs(
        delta
      )
      >=
      ROTATION_DEAD_ZONE_DEG
    ) {

      newRotation =
        state.gestureStartRotation
        +
        delta;

    }


    renderRotation(
      newRotation
    );


    state.gestureLastMidpoint =
      midpoint;


    if (
      state.gestureAnchorLatLng
    ) {

      /*
        Immediate correction keeps the pivot visually locked.
      */
      keepLatLngAtClientPoint(
        state.gestureAnchorLatLng,
        midpoint.clientX,
        midpoint.clientY
      );


      /*
        Kakao may process native pinch zoom after our handler.
        Re-pin the same geographic anchor in the next frames.
      */
      scheduleAnchorCorrection(
        state.gestureAnchorLatLng,
        midpoint.clientX,
        midpoint.clientY
      );

    }

  }


  function stopTwoFingerGesture() {

    state.gestureActive =
      false;

    state.gestureStartAngle =
      null;

    state.gestureStartRotation =
      state.rotation;

    state.gestureAnchorLatLng =
      null;

    state.gestureLastMidpoint =
      null;


    restoreNativeDragIfPossible();

  }


  /* =====================================================
     TOUCH ROUTING
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


      /*
        Smoothly transition from a two-finger gesture to dragging
        with the remaining finger.
      */
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

      restoreNativeDragIfPossible();

    }

  }


  function onTouchCancel() {

    stopOneFingerDrag();

    stopTwoFingerGesture();

    restoreNativeDragIfPossible();

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


      renderRotation(
        startRotation
        *
        (
          1
          -
          eased
        )
      );


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

        renderRotation(
          0
        );

        restoreNativeDragIfPossible();

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


    /*
      Make sure Kakao knows its actual oversized canvas dimensions.
    */
    updateOverscanGeometry(
      true
    );


    restoreNativeDragIfPossible();

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
        .__ourDateRotationV3Wrapped
    ) {
      return;
    }


    const original =
      renderDateMap;


    const wrapped =
      function () {

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


    wrapped.__ourDateRotationV3Wrapped =
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

    /*
      PC test:
      Shift + wheel = rotate by 5 degrees.
    */
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


        renderRotation(
          state.rotation
          +
          direction
          *
          5
        );


        restoreNativeDragIfPossible();

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


    createRotationUi();

    /*
      Size the oversized square before the Kakao map is created
      whenever possible.
    */
    updateOverscanGeometry(
      false
    );


    attachResizeObserver();

    attachTouchListeners();

    attachDesktopTestSupport();

    hookRenderDateMap();

    renderRotation(
      0
    );


    setTimeout(
      configureCurrentMap,
      0
    );


    window.ourDateMapRotation = {

      set:
        function (
          angle
        ) {

          renderRotation(
            angle
          );

          restoreNativeDragIfPossible();

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

        }

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
