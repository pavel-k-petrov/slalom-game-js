/*
состояния:
- выбор цели
- анимация перемещения

на события подписываемся один раз, обработчик - в объекте состояния
состояние триггерит свои события, которые могут делать дела и переключать состояние

план
+ svg каяк цели
+ выбор цели, svg стрелки
+ перемещение
+ svg границы
+ viewport
+ границы collision
+ области течения
+ ворота, svg и расстановка
+ ворота, пересечение
+ подсчёт
+ вывод результата
+ реальная трасса

bugfix и улучшательства
+ webpack
+ сделать zoom viewport-а
+ сделать динамический zoom viewport-а в зависимости от скорости, чтобы и цель и лодка влезали вертикально
+ анимация поворота через 90*, нужно использовать разницу углов для подсчёта
+ refactor
+ collision c кружком вместо точки
+ рассчитывать zoom по-умному - чтобы всё динамическое и каякер тоже влезало на экран
- работа на мобилке
+ Авдотские декорации
- сделать снос при наезде на границу
- проверить пересечение финиша
- сделать пропуск хода (2?) при наезде на границу
- выводить скорость течения и(или) следующий круг выбора ход при предварительном выборе
+ показывать направление на следующие ворота если их не видно
- учитывать заход а не только выход при отсуживании ворот (сейчас можно коснуться линии не с той стороны и выйти назад и получить зачёт)
+ анимация взятия ворот и вешек
- после финиша трассы выдавать бухло)
- сохранять угол при столкновении
- улучшить модель движения чтобы при траверсе струи в улове скорость оставалась маленькой при этом оставить снос течением и визуализацию траверса
    разницу течений вычитать из скорости если против течения?
    похоже надо вводить в формулу угол поворота
- (opt) убрать управление на время анимации
- refactor 2 (draw)
*/

import { GateVisualization, Viewport } from "./gate-visualization";
import { CollisionSystem } from "./collision-system";
import Snap from "snapsvg";
import { GameScore, GameScoreVisualization } from "./game-score";
import { Vector, point, segment } from "@flatten-js/core";
import { Player, PossibleTarget } from "./player";


$(function () {
  const svg = Snap('#map-svg');
  const targetLine = svg.select('#target-line');
  const gateVisualization = GateVisualization.ApplyToSvg(svg);
  const collisionSystem = CollisionSystem.ReadFromSvg(svg);
  const startX = Number(svg.select('#start-position').attr('cx'));
  const startY = Number(svg.select('#start-position').attr('cy'));
  let player: Player = new Player(collisionSystem, segment(point(startX, startY), point(startX, startY)));
  let possibleTarget: PossibleTarget = player.calculateTarget();
  let viewport: Viewport = {
    ...new Viewport(),
    viewCenterX: (svg.node as any).width.baseVal.value / 2,
    viewCenterY: (svg.node as any).height.baseVal.value / 2,
  };

  let gateCount = 0;
  svg.selectAll('.gate-position').forEach(x => { gateCount++; });
  let gameScore = new GameScore(gateCount);
  GameScoreVisualization.Visualize(svg, gameScore);
  let isTargeting: boolean = false;
  draw();


  function moveTo(newX: number, newY: number): void {
    const oldX = player.x;
    const oldY = player.y;
    const oldHead = player.head();

    // физика
    player = player.moveTo(newX, newY);

    // гребной слалом
    const gatesCollision = collisionSystem.GetGatesCollision(oldX, oldY, player.x, player.y);
    const finishCrossing = collisionSystem.TestFinishCrossing(oldHead, player.head().center);
    const scoredGatesCollisions = gameScore.MoveTurn(finishCrossing, gatesCollision);

    // визуализация
    GameScoreVisualization.Visualize(svg, gameScore);
    gateVisualization.DrawGateCollisions(scoredGatesCollisions, point(player.x, player.y));
    possibleTarget = player.calculateTarget();
    draw(true);
    gateVisualization.DrawNextGateMarkIfNeeded(gameScore.getNextGate(), viewport, 500);
  }

  function draw(isAnimated?: boolean) {
    const playerSvg = svg.select('#player');
    const baseZoom = 1;
    viewport = {
      ...viewport,
      offsetX: possibleTarget.centerX,
      offsetY: possibleTarget.centerY,
      zoom: baseZoom,
    };

    const targetMask = svg.select('#target-mask circle');
    targetMask.attr({
      r: possibleTarget.limitRadius,
      cx: possibleTarget.limitX,
      cy: possibleTarget.limitY,
    });

    svg.select('#target').attr({
      r: possibleTarget.radius,
      cx: possibleTarget.centerX,
      cy: possibleTarget.centerY,
    });

    viewport.zoom = calcViewportZoom();
    const viewportTransform = `translate(${viewport.viewCenterX}, ${viewport.viewCenterY}) scale(${viewport.zoom}) translate(${-viewport.offsetX}, ${-viewport.offsetY})`

    const speed = Math.sqrt(
      player.speedX * player.speedX + player.speedY * player.speedY
    );
    const c = speed === 0 ? 1 : player.speedX / speed;
    const s = speed === 0 ? 0 : player.speedY / speed;

    if (isAnimated) {
      const m = playerSvg.transform().localMatrix;
      const oldPosition = point(m.x(0, 0), m.y(0, 0));
      const oldDirection = new Vector(oldPosition, point(m.x(1, 0), m.y(1, 0)));
      const newDirection = new Vector(c, s);

      const rotationLine = segment([oldDirection.x, oldDirection.y, newDirection.x, newDirection.y]);
      const badVector = segment(point(0, 0), point(0, -1));// через него не вращается, идёт вокруг
      const a1 = normalizeAngle(oldDirection.angleTo(new Vector(0, -1)) * 180 / Math.PI);
      const a2 = normalizeAngle(newDirection.angleTo(new Vector(0, -1)) * 180 / Math.PI);
      if (rotationLine.intersect(badVector).length > 0 && a1 + a2 !== 0) {
        // если вращение идёт через 0, -1 надо сделать хак
        const moveVector = new Vector(oldPosition, point(player.x, player.y));
        const middle = oldPosition.translate(moveVector.multiply(a1 / (a1 + a2)));
        const t1 = `matrix(0,-1,1,0,${middle.x},${middle.y})`;
        const t2 = `matrix(-0.001,-1,1,-0.001,${middle.x},${middle.y})`;
        const firstAnim = oldDirection.x > 0 ? t1 : t2;
        const hackTransform = oldDirection.x > 0 ? t2 : t1;
        playerSvg.animate({ transform: firstAnim }, 500 * a1 / (a1 + a2), undefined,
          () => {
            playerSvg.transform(hackTransform);
            playerSvg.animate(
              { transform: `matrix(${c},${s},${-s},${c},${player.x},${player.y})` },
              500 * a2 / (a1 + a2));
          })
      } else {
        playerSvg.animate(
          { transform: `matrix(${c},${s},${-s},${c},${player.x},${player.y})` },
          500
        );
      }
      svg.select('#viewport').animate(
        { transform: `${viewportTransform}` },
        500
      );
    } else {
      playerSvg.transform(
        `matrix(${c},${s},${-s},${c},${player.x},${player.y})`
      );
      svg.select('#viewport').transform(`${viewportTransform}`);
    }
  }

  function calcViewportZoom(): number {
    let zoom = 1.0; //???
    const head = player.head();

    const delatX = Math.abs(head.center.x - possibleTarget.centerX) + head.r;
    const delatY = Math.abs(head.center.y - possibleTarget.centerY) + head.r;
    const zoomX = delatX <= viewport.viewCenterX ? 1 : viewport.viewCenterX / delatX;
    const zoomY = delatY <= viewport.viewCenterY ? 1 : viewport.viewCenterY / delatY;

    zoom = Math.min(zoomX, zoomY);
    return zoom;
  }

  function normalizeAngle(a: number): number {
    if (a > 0 && a < 180) {
      return a;
    }

    return 360 - a;
  }

  function viewportToWorldCoordinates(x: number | undefined, y: number | undefined): { x: number | undefined; y: number | undefined } {
    return {
      x: ((x ?? 0) - viewport.viewCenterX) / viewport.zoom + viewport.offsetX,
      y: ((y ?? 0) - viewport.viewCenterY) / viewport.zoom + viewport.offsetY,
    };
  }

  function doTargeting(event: JQuery.Event) {
    const { x, y } = viewportToWorldCoordinates(event.offsetX, event.offsetY);
    const inTarget = possibleTarget.limitByTarget(x, y);
    targetLine.attr({
      x1: player.x,
      y1: player.y,
      x2: inTarget.x,
      y2: inTarget.y,
      visibility: 'visible',
    });

    const collision = collisionSystem.GetBorderCollision(player.head(), inTarget, svg.select('#debug'));
    if (collision) {
      svg.select('#collision-mark').transform(`translate(${collision.x},${collision.y})`).attr({ visibility: 'visible' });
    } else {
      svg.select('#collision-mark').attr({ visibility: 'hidden' });
    }
  }

  $('#map-svg').on('mousemove', function (event: JQuery.Event) {
    if (!isTargeting) {
      return;
    }
    doTargeting(event);
  });

  // $('#map-svg').on('pointermove', function (event: JQuery.Event) {
  //   if (!isTargeting) {
  //     return;
  //   }
  //   doTargeting(event);
  // });

  $('#map-svg').on('mousedown', function (event: JQuery.Event) {
    isTargeting = true;
    doTargeting(event);
  });

  // $('#map-svg').on('pointerenter', function (event: JQuery.Event) {
  //   isTargeting = true;
  //   doTargeting(event);
  // });

  $('#map-svg').on('mouseup', function (event: JQuery.Event) {
    isTargeting = false;
    const { x, y } = viewportToWorldCoordinates(event.offsetX, event.offsetY);
    if (x === undefined || y === undefined) {
      return;
    }
    targetLine.attr({ visibility: 'hidden' });
    svg.select('#collision-mark').attr({ visibility: 'hidden' });
    moveTo(x, y);
  });


  // $('#map-svg').on('pointerleave', function (event: JQuery.Event) {
  //   isTargeting = false;
  //   const { x, y } = viewportToWorldCoordinates(event.offsetX, event.offsetY);
  //   if (x === undefined || y === undefined) {
  //     return;
  //   }
  //   targetLine.attr({ visibility: 'hidden' });
  //   svg.select('#collision-mark').attr({ visibility: 'hidden' });
  //   moveTo(x, y);
  // });  
});
