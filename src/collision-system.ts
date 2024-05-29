import { segment, PlanarSet, point, Point, Polygon, Segment, AnyShape, circle, Vector, matrix, Circle, arc, line, vector, Line, Box } from '@flatten-js/core';
import Snap from 'snapsvg';
import { Command, parseSVG } from 'svg-path-parser';

export type GateCollisionType =
    'Pass' | 'TouchOnPass' | 'WrongDirection' | 'TouchOnWrongDirection' | 'StayTouchingLine'
    | 'TouchLeft' | "TouchRight";
export type GateCollision = { gateNumber: number, types: Set<GateCollisionType> }
type GateMetadata = { number: number, type: 'right-pole' | 'left-pole' | 'line', gateSegment: Segment };
export const gatePoleRadius = 10;

export class CollisionSystem {
    private borderSet = new PlanarSet();
    private flowSet = new PlanarSet();
    private gateSet = new PlanarSet();
    private finishLine: Polygon;

    static ReadFromSvg(svg: Snap.Paper): CollisionSystem {
        const result = new CollisionSystem();
        result.Init(svg);
        return result;
    }

    public GetBorderCollision(origin: Circle, target: Point, testSvg?: Snap.Element): Point | undefined {
        const playerPoint = origin.center;
        const moveSegment = segment(playerPoint, target);
        // const movePoly = this.GetCollisionPoly(origin, target);
        // if (testSvg) {
        //     const svgFragment = Snap.parse(movePoly.svg({ fillOpacity: 0.3 }));
        //     testSvg.children().forEach(x => x.remove());
        //     testSvg.add(svgFragment.selectAll('*'));
        //     this.borderSet.search(movePoly.box).forEach(x => this.polyIntersect(movePoly, x).forEach(p => {
        //         testSvg.add(Snap.parse(p.p.svg({})).selectAll('*'));
        //         testSvg.add(Snap.parse(p.n.svg(new Box(p.p.x - 15, p.p.y - 15, p.p.x + 15, p.p.y + 15))).selectAll('*'));
        //     }));
        // }
        const collisionPoints = this.borderSet.search(moveSegment.box).reduce(
            (previousValue: Point[], currentValue: AnyShape) => {
                var points = moveSegment.intersect(currentValue);

                previousValue.push(...points);
                return previousValue;
            },
            [] as Point[]
        );
        if (collisionPoints.length === 0) {
            return undefined;
        }
        collisionPoints.sort((a, b) => a.distanceTo(playerPoint)[0] - b.distanceTo(playerPoint)[0]);
        const collisionPoint = collisionPoints[0];
        const safeVector = vector(playerPoint, collisionPoint).normalize();
        const safePoint = collisionPoint.translate(safeVector.multiply(-1));
        if (vector(playerPoint, safePoint).dot(vector(playerPoint, target)) <= 0) {
            return playerPoint;
        }
        return safePoint;
    }

    private GetCollisionPoly(origin: Circle, target: Point): Polygon {
        const playerPoint = origin.center;
        const moveVector = new Vector(playerPoint, target);
        const leftNormal = moveVector.rotate90CW().normalize().multiply(origin.r);
        const rightNormal = leftNormal.multiply(-1);
        const arcAngleStart = this.normalizeAngleRads(-leftNormal.angleTo(new Vector(1, 0)));
        const arcAngleEnd = this.normalizeAngleRads(arcAngleStart + Math.PI);
        const movePoly = new Polygon();
        const p1 = playerPoint.translate(rightNormal);
        const p2 = playerPoint.translate(rightNormal.add(moveVector));
        const p3 = playerPoint.translate(leftNormal.add(moveVector));
        const p4 = playerPoint.translate(leftNormal);
        movePoly.addFace(
            [
                segment(p2, p1),
                segment(p1, p4),
                segment(p4, p3),
                arc(target, origin.r, arcAngleStart, arcAngleEnd, true),
            ]);
        return movePoly;
    }

    private normalizeAngleRads(a: number): number {
        while (a < 0) {
            a += Math.PI * 2;
        }

        while (a >= Math.PI * 2) {
            a -= Math.PI * 2;
        }

        return a;
    }

    public GetFlowDirectionAt(x: number, y: number): { vx: number, vy: number } {
        const hits = this.flowSet.hit(point(x, y));
        if (hits.length === 0) { return { vx: 0, vy: 0, } }

        const direction: Segment = (hits[0] as any).flowDirectionHack;
        if (!direction) { return { vx: 0, vy: 0, } }

        return {
            vx: direction.pe.x - direction.ps.x,
            vy: direction.pe.y - direction.ps.y,
        };
    }

    /** возвращает долю хода, за которую доехали до финиша или undefined если в этом ходу не доехали */
    public TestFinishCrossing(origin: Circle, target: Point): number | undefined {
        if (this.finishLine) {
            const playerPoint = origin.center;
            const move = segment(playerPoint, target);
            const intersection = move.intersect(this.finishLine);
            if (intersection.length > 0) {
                return new Vector(playerPoint, intersection[0]).length / new Vector(playerPoint, target).length;
            }
        }

        return undefined;
    }

    public GetGatesCollision(x1: number, y1: number, x2: number, y2: number): GateCollision[] {
        const playerPoint = point(x1, y1);
        const moveVector = segment(playerPoint, point(x2, y2));
        const collisions = this.gateSet.search(moveVector.box).reduce(
            (previousValue: { number: number, distance: number, types: Set<GateCollisionType> }[], currentValue: AnyShape) => {
                const intersections = moveVector.intersect(currentValue);
                if (intersections.length > 0) {
                    const data = this.GetGateMetadataHack(currentValue);
                    if (data && data.number) {
                        let collisionType: GateCollisionType | undefined;
                        if (data.type == 'left-pole') {
                            collisionType = 'TouchLeft';
                        } else if (data.type == 'right-pole') {
                            collisionType = 'TouchRight';
                        } else if (data.type == 'line') {
                            collisionType = this.getLineCollisionType(moveVector, data, currentValue as Polygon);
                        }

                        if (collisionType) {
                            const previousResult = previousValue.find(x => x.number === data.number);
                            if (previousResult) {
                                previousResult.types.add(collisionType);
                            } else {
                                previousValue.push({
                                    number: data.number,
                                    types: new Set<GateCollisionType>([collisionType]),
                                    distance: new Vector(playerPoint, intersections[0]).length,
                                });
                            }
                        }
                    }
                }

                return previousValue;
            },
            [] as { number: number, distance: number, types: Set<GateCollisionType> }[]
        );

        collisions.sort((a, b) => a.distance - b.distance);

        return collisions.map(x => ({
            gateNumber: x.number,
            distance: x.distance,
            types: x.types,
        }));
    }
    getLineCollisionType(moveVector: Segment, data: GateMetadata, gateBox: Polygon): GateCollisionType {
        let collisionType: GateCollisionType = undefined;
        const wasTouching = gateBox.contains(moveVector.ps);
        const isTouching = gateBox.contains(moveVector.pe);
        if (isTouching && wasTouching){
            return 'StayTouchingLine';
        }

        const gateSegment = data.gateSegment;
        if (new Vector(gateSegment.ps, gateSegment.pe)
            .rotate90CCW()
            .dot(new Vector(moveVector.ps, moveVector.pe)) > 0) {
            collisionType = isTouching ? 'TouchOnPass' : 'Pass';
        } else {
            collisionType = isTouching ? 'TouchOnWrongDirection' : 'WrongDirection';
        }

        return collisionType;
    }

    private Init(svg: Snap.Paper) {
        const headRadius = Number(svg.select('#player-head').attr("r"));
        this.InitBorders(svg, headRadius, svg.select('#debug'));
        this.InitFlows(svg);
        this.InitGates(svg, headRadius);
    }

    private InitGates(svg: Snap.Paper, headRadius: number) {
        const gates = svg.selectAll(".gate-position");
        gates.forEach((gate: Snap.Element, index) => {
            const gateNumber = index ? index + 1 : 1;
            const { gateInterior, gateSegment } = this.LineElementToGateInterior(gate, headRadius);
            const gateLine = this.SetGateMetadataHack(
                gateInterior,
                { number: gateNumber, type: 'line', gateSegment });
            const rightPole = this.SetGateMetadataHack(
                circle(gateSegment.ps, gatePoleRadius + headRadius),
                { number: gateNumber, type: 'right-pole', gateSegment });
            const leftPole = this.SetGateMetadataHack(
                circle(gateSegment.pe, gatePoleRadius + headRadius),
                { number: gateNumber, type: 'left-pole', gateSegment });

            this.gateSet.add(gateLine);
            this.gateSet.add(leftPole);
            this.gateSet.add(rightPole);

        });
        const finish = svg.select('#finish-gate-position');
        if (finish) {
            this.finishLine = this.LineElementToGateInterior(finish, headRadius).gateInterior;
        }
    }
    private LineElementToGateInterior(gate: Snap.Element, headRadius: number)
        : { gateInterior: Polygon, gateSegment: Segment } {
        const p1 = point(Number(gate.attr('x1')), Number(gate.attr('y1')));
        const p2 = point(Number(gate.attr('x2')), Number(gate.attr('y2')));
        const n = vector(p1, p2).rotate90CW().normalize().multiply(headRadius);
        const seg = segment(p1, p2);
        return {
            gateSegment: seg,
            gateInterior: new Polygon([
                p1.translate(n), p2.translate(n),
                p2.translate(n.multiply(-1)), p1.translate(n.multiply(-1))]),
        };
    }

    private SetGateMetadataHack<T>(victim: T, gateData: GateMetadata): T {
        (victim as any).GateNumberHack = gateData;
        return victim;
    }

    private GetGateMetadataHack(victim: any): GateMetadata { return victim.GateNumberHack as GateMetadata; }
    /** новый подход, path с ссылкой на паттерн с трансформацией для скорости потока */
    private InitFlows(svg: Snap.Paper) {
        svg.selectAll('#flows>path').forEach((el: Snap.Element) => {
            const direction = this.GetFlowDirectionFromElement(el);
            if (!direction) {
                console.log(el, 'cannot find direction'); // надо ругаться если свг неправильное
                return;
            }
            let points: Point[] = this.GetPathSvgPoints(el);
            const polygon = new Polygon(points);
            (polygon as any).flowDirectionHack = direction;
            this.flowSet.add(polygon)
        });
    }

    private GetFlowDirectionFromElement(el: Snap.Element): Segment | undefined {
        try {
            const pattern = (el.attr('fill') as any)?.node as SVGPatternElement;
            const m = pattern?.patternTransform?.baseVal[0]?.matrix;

            if (!m) { return undefined; }

            const flowMatrix = matrix(m.a, m.b, m.c, m.d, 0, 0);
            const baseVector = new Vector(0, -100);

            const flow = baseVector.transform(flowMatrix);
            return segment(point(0, 0), point(flow.x, flow.y));
        }
        catch {
            return undefined;
        }
    }

    /** старый подход, g{poligon, line} */
    private InitFlowsFromGroups(svg: Snap.Paper) {
        const flowGroups = svg.selectAll('.flow');
        flowGroups.forEach((group: Snap.Element) => {
            const directionSvg = group.select('line');
            const direction = segment(
                point(Number(directionSvg.attr('x1')), Number(directionSvg.attr('y1'))),
                point(Number(directionSvg.attr('x2')), Number(directionSvg.attr('y2'))));
            let points: Point[];
            const polylineSvg = group.select('polygon');
            if (polylineSvg) {
                points = this.GetPolylineSvgPoints(polylineSvg);
            } else {
                const pathSvg = group.select('path');
                points = this.GetPathSvgPoints(pathSvg);
            }
            const polygon = new Polygon(points);
            (polygon as any).flowDirectionHack = direction;
            this.flowSet.add(polygon);
        });
    }

    private InitBorders(svg: Snap.Paper, headRadius: number, testSvg?: Snap.Element) {
        const borders = svg.selectAll('#borders>*');
        borders.forEach((el: Snap.Element) => {
            let points: Point[];
            if (el.node.tagName.toUpperCase() === 'POLYLINE') {
                points = this.GetPolylineSvgPoints(el);
            } else if (el.node.tagName.toUpperCase() === 'PATH') {
                points = this.GetPathSvgPoints(el);
            }

            const segments = points.reduce(
                (previousValue: AnyShape[], currentValue: Point, currentIndex: number, array: Point[]) => {
                    if (currentIndex > 0) {
                        const seg = segment(array[currentIndex - 1], currentValue);
                        const boundPoly = this.BuildBoundPoly(seg, headRadius);
                        // previousValue.push(seg);
                        previousValue.push(boundPoly);
                    }
                    return previousValue;
                },
                [] as AnyShape[]
            );
            segments.forEach(x => {
                this.borderSet.add(x);
            });
            if (testSvg) {
                //testSvg.children().forEach(x => x.remove());
                segments.forEach(x => {
                    if (!(x instanceof Polygon)) {
                        return;
                    }
                    const svgFragment = Snap.parse(x.svg({ fillOpacity: 0.3 }));
                    testSvg.add(svgFragment.selectAll('*'));
                });
            }
        });
    }

    private BuildBoundPoly(seg: Segment, r: number): Polygon {
        const n = seg.tangentInStart().rotate90CCW().normalize().multiply(r);
        const arcAngleStart = this.normalizeAngleRads(-n.angleTo(new Vector(1, 0)));
        const arcAngleEnd = this.normalizeAngleRads(arcAngleStart + Math.PI);

        const movePoly = new Polygon();
        movePoly.addFace(
            [
                seg.translate(n),
                arc(seg.pe, r, arcAngleStart, arcAngleEnd, false),
                seg.reverse().translate(n.multiply(-1)),
                arc(seg.ps, r, arcAngleStart, arcAngleEnd, true),
            ]);
        return movePoly;
    }

    private GetPolylineSvgPoints(polyline: Snap.Element): Point[] {
        const pointsArray: string[] = (polyline.attr("points") as unknown) as string[];
        const points = pointsArray.reduce(
            (previousValue: Point[], currentValue: string, currentIndex: number, array: string[]) => {
                if (currentIndex % 2) {
                    const coords = [Number(array[currentIndex - 1]), Number(currentValue)];
                    previousValue.push(point(coords[0], coords[1]));
                }
                return previousValue;
            },
            [] as Point[]
        );
        return points;
    }

    private GetPathSvgPoints(pathSvg: Snap.Element): Point[] {
        const pathDef = parseSVG(pathSvg.attr("d"));
        const points = pathDef.reduce(
            (previousValue: Point[], cmd: Command) => {
                if (cmd.command == 'closepath') {
                    if (previousValue.length > 0) {
                        previousValue.push(previousValue[0]);
                    }
                } else {

                    if (!cmd.relative || previousValue.length === 0) {
                        const p = this.GetPointFromPathCommand(cmd);
                        previousValue.push(p);
                    } else {
                        const p = this.GetPointFromPathCommand(cmd);
                        const prevPoint = previousValue[previousValue.length - 1];
                        previousValue.push(point(prevPoint.x + p.x, prevPoint.y + p.y));
                    }
                }
                return previousValue;
            },
            [] as Point[]
        );
        return points;
    }

    private GetPointFromPathCommand(cmd: Command): Point {
        if (cmd.command == 'closepath') { return point(0, 0); }
        if (cmd.command == 'horizontal lineto') { return point(cmd.x, 0); }
        if (cmd.command == 'vertical lineto') { return point(0, cmd.y); }
        return point(cmd.x, cmd.y);
    }
}

// const seg1 = segment(point(0, 0), point(100, 0));
// const seg2 = segment(point(0, -50), point(100, 50));
// console.log([seg1.intersect(seg2), "intersect"]);

// const scenery = new PlanarSet();
// console.log([scenery.index, "index"]);
// scenery.add(seg2);
// console.log([scenery.search(seg1.box), 'query']);