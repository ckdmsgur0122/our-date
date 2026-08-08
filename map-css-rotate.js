/*
 * Our Date - Experimental Kakao Map CSS rotation v2
 *
 * v2 핵심:
 * 1. 두 손가락 회전의 축을 "두 손가락 중점"으로 보정
 * 2. 회전된 상태의 한 손가락 드래그 벡터를 역회전시켜
 *    Kakao Map 좌표계에 전달 -> 화면 방향과 지도 이동 방향 일치
 * 3. 기존 Kakao pinch zoom은 최대한 유지
 * 4. N 버튼으로 북쪽(0°) 복귀
 *
 * 주의:
 * Kakao Web Map의 진짜 bearing 기능이 아니라 CSS transform 기반 실험판.
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
    "ourDateMapCssRotateStylesV2";

  const ROTATION_DEAD_ZONE_DEG =
    0.7;

  const DRAG_START_THRESHOLD_PX =
    3;

  const NORTH_EPSILON_DEG =
    0.35;


  const state = {
    mapElement:
      null,

    wrapper:
      null,

    resetButton:
      null,

    angleLabel:
      null,

    rotation:
      0,

    coverScale:
      1,

    mapInstance:
      null,

    originalDraggable:
      true,

    /*
     * one-finger drag
     */
    dragActive:
      false,

    dragMoved:
      false,

    dragStartClientX:
      0,

    dragStartClientY:
      0,

    dragLastClientX:
      0,

    dragLastClientY:
      0,

    /*
     * two-finger gesture
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

    anchorFrame1:
      null,

    anchorFrame2:
      null,

    /*
     * reset animation
     */
    resetAnimationFrame:
      null
  };


  /* =====================================================
     STYLE / LAYOUT
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

        /*
          touch 이벤트 자체는 JS에서 필요한 경우만 막는다.
          두 손가락 pinch는 Kakao Map 쪽으로 계속 전달한다.
        */
        touch-action: auto;

        contain: paint;
      }

      #${WRAPPER_ID} > #dateMap {
        position: absolute;

        left: 0;
        top: 0;

        width: 100%;
        height: 100%;

        margin: 0;

        transform-origin: 50% 50%;

        transform:
          rotate(0deg)
          scale(1);

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
        "지도 회전 v2: #dateMap을 찾지 못했어."
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
      기존 .date-map 높이 규칙은 wrapper가 대신 가진다.
      map 본체는 wrapper 전체 크기를 사용한다.
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
     CSS ROTATION / COVER SCALE
  ===================================================== */

  function calculateCoverScale(
    rotation
  ) {

    if (!state.wrapper) {
      return 1;
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
      return 1;
    }


    const radians =
      degreesToRadians(
        Math.abs(
          rotation
        )
      );

    const cos =
      Math.abs(
        Math.cos(
          radians
        )
      );

    const sin =
      Math.abs(
        Math.sin(
          radians
        )
      );


    /*
      원래 viewport를 회전된 직사각형이
      완전히 덮기 위한 최소 uniform scale.
    */
    const horizontalRequirement =
      cos
      +
      (
        height
        /
        width
      )
      *
      sin;

    const verticalRequirement =
      cos
      +
      (
        width
        /
        height
      )
      *
      sin;


    return Math.max(
      1,
      horizontalRequirement,
      verticalRequirement
    );

  }


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


    state.coverScale =
      calculateCoverScale(
        state.rotation
      );


    state.mapElement.style.transform =
      "rotate("
      +
      state.rotation
      +
      "deg) "
      +
      "scale("
      +
      state.coverScale
      +
      ")";


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
        아직 dateMap lexical binding 접근 불가
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

    /*
      북쪽(0°)이면 Kakao의 원래 드래그를 다시 사용한다.
      회전 상태에서는 벡터 보정을 위해 커스텀 드래그를 사용한다.
    */
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

  }


  function clientPointToUnderlyingContainerPoint(
    clientX,
    clientY,
    rotation,
    scale
  ) {

    const rect =
      state.wrapper
        .getBoundingClientRect();


    const screenX =
      clientX
      -
      rect.left;

    const screenY =
      clientY
      -
      rect.top;


    const screenCenterX =
      rect.width
      /
      2;

    const screenCenterY =
      rect.height
      /
      2;


    /*
      CSS 결과 화면 좌표 -> 회전 전 Kakao container 좌표

      1. 화면 중심 기준 벡터
      2. CSS scale 역변환
      3. CSS rotate 역변환
    */
    const displayVectorX =
      (
        screenX
        -
        screenCenterX
      )
      /
      scale;

    const displayVectorY =
      (
        screenY
        -
        screenCenterY
      )
      /
      scale;


    const underlyingVector =
      rotateVector(
        displayVectorX,
        displayVectorY,
        -rotation
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
        clientY,
        state.rotation,
        state.coverScale
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
        clientY,
        state.rotation,
        state.coverScale
      );


    const currentPoint =
      projection
        .containerPointFromCoords(
          latLng
        );


    const currentCenter =
      map.getCenter();


    const centerPoint =
      projection
        .containerPointFromCoords(
          currentCenter
        );


    /*
      anchor가 현재 q_current에 있고
      q_desired로 보내고 싶으면,

      map center를
      q_current - q_desired
      만큼 이동시키면 된다.
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
      0.05
      &&
      Math.abs(
        deltaY
      )
      <
      0.05
    ) {
      return;
    }


    const newCenterPoint =
      new kakao.maps.Point(
        centerPoint.x
        +
        deltaX,

        centerPoint.y
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


    /*
      첫 frame:
      CSS rotation 적용 직후 보정

      두 번째 frame:
      Kakao pinch zoom이 같은 touchmove에서
      level을 갱신했을 경우 한 번 더 보정
    */
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


  function panByScreenDrag(
    screenDx,
    screenDy
  ) {

    const map =
      syncMapInstance();


    if (!map) {
      return;
    }


    /*
      화면상 drag 벡터를
      현재 CSS 회전/확대의 역변환을 해서
      Kakao Map의 원래 x/y 방향으로 바꾼다.

      예:
      지도 90° 회전 상태에서
      손가락을 화면 위쪽으로 밀면
      Kakao에는 그에 대응되는 옆 방향 pan이 들어간다.
    */
    const unscaledX =
      screenDx
      /
      state.coverScale;

    const unscaledY =
      screenDy
      /
      state.coverScale;


    const mapDrag =
      rotateVector(
        unscaledX,
        unscaledY,
        -state.rotation
      );


    const projection =
      map.getProjection();


    const center =
      map.getCenter();


    const centerPoint =
      projection
        .containerPointFromCoords(
          center
        );


    /*
      손가락이 +v로 움직이면
      지도 그림도 +v로 따라와야 하므로
      지도 중심은 -v 방향으로 이동한다.
    */
    const newCenterPoint =
      new kakao.maps.Point(
        centerPoint.x
        -
        mapDrag.x,

        centerPoint.y
        -
        mapDrag.y
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

    state.dragLastClientX =
      touch.clientX;

    state.dragLastClientY =
      touch.clientY;

  }


  function updateOneFingerDrag(
    event,
    touch
  ) {

    if (!state.dragActive) {
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


    const dx =
      touch.clientX
      -
      state.dragLastClientX;

    const dy =
      touch.clientY
      -
      state.dragLastClientY;


    state.dragLastClientX =
      touch.clientX;

    state.dragLastClientY =
      touch.clientY;


    /*
      회전 상태에서는 브라우저 페이지 스크롤 대신
      우리가 직접 지도를 pan한다.
    */
    if (
      event.cancelable
    ) {

      event.preventDefault();

    }


    panByScreenDrag(
      dx,
      dy
    );

  }


  function stopOneFingerDrag() {

    state.dragActive =
      false;

    state.dragMoved =
      false;

  }


  /* =====================================================
     TWO-FINGER ROTATION
  ===================================================== */

  function startTwoFingerGesture(
    touch1,
    touch2
  ) {

    stopOneFingerDrag();


    /*
      제스처 중에는 Kakao의 기본 "지도 이동"만 끈다.
      pinch zoom은 setZoomable을 건드리지 않으므로
      Kakao 쪽에서 계속 처리할 수 있다.
    */
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
      핵심:
      두 손가락 중점 바로 아래의 실제 지도 좌표를 기억한다.
      회전 중 이 LatLng이 계속 두 손가락 중점 밑에 있도록
      map center를 보정한다.

      따라서 CSS 자체 transform-origin은 중앙이어도
      사용자는 "두 손가락 중점을 축으로 회전"한다고 느끼게 된다.
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


    /*
      rotate + 자동 cover scale로 인해
      중점 아래 지도가 미끄러지지 않도록 즉시 보정.
    */
    if (
      state.gestureAnchorLatLng
    ) {

      keepLatLngAtClientPoint(
        state.gestureAnchorLatLng,
        midpoint.clientX,
        midpoint.clientY
      );


      /*
        Kakao의 native pinch zoom 처리가
        같은 프레임 뒤에서 일어나는 경우까지 보정.
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
     TOUCH EVENT ROUTER
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
    ) {

      /*
        북쪽 상태에서는 Kakao의 native drag 사용.
        회전 상태에서만 커스텀 drag 시작.
      */
      if (
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

      /*
        한 손가락 drag 중 두 번째 손가락이 올라온 경우도
        자연스럽게 회전 제스처로 전환.
      */
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


    /*
      두 손가락 -> 한 손가락으로 바뀐 경우:
      회전 제스처를 끝내고
      남은 한 손가락을 새 drag 시작점으로 잡는다.
    */
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


    /*
      지도 중심 자체는 그대로 두고
      회전만 가장 짧은 방향으로 0°까지 복귀.
    */
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


      /*
        easeOutCubic
      */
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
     UI
  ===================================================== */

  function createRotationUi() {

    if (
      document.getElementById(
        RESET_BUTTON_ID
      )
    ) {

      state.resetButton =
        document.getElementById(
          RESET_BUTTON_ID
        );

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
     MAP LIFECYCLE
  ===================================================== */

  function configureCurrentMap() {

    const map =
      syncMapInstance();


    if (!map) {
      return;
    }


    restoreNativeDragIfPossible();

  }


  function hookRenderDateMap() {

    if (
      typeof renderDateMap !==
      "function"
    ) {

      /*
        프로젝트 구조가 달라졌을 때도
        addon 자체가 페이지를 깨지 않도록 한다.
      */
      return;

    }


    if (
      renderDateMap
        .__ourDateRotationV2Wrapped
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


        /*
          새 kakao.maps.Map 인스턴스가 만들어진 뒤 연결.
        */
        setTimeout(
          configureCurrentMap,
          0
        );


        return result;

      };


    wrapped.__ourDateRotationV2Wrapped =
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


    /*
      회전된 상태의 한 손가락 drag에서는
      preventDefault가 필요해서 passive:false.
      두 손가락일 때는 preventDefault를 호출하지 않으므로
      Kakao pinch zoom은 계속 전달된다.
    */
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
      PC 시험용:
      Shift + 휠 = CSS 회전
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

    attachTouchListeners();

    attachDesktopTestSupport();

    hookRenderDateMap();

    renderRotation(
      0
    );


    /*
      이미 map이 만들어진 상태에서 addon이 로드된 경우.
    */
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

      getScale:
        function () {

          return state.coverScale;

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
