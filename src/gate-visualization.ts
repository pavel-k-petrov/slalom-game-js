import { Point, Segment, Vector, point, segment } from "@flatten-js/core";
import { GateCollision, gatePoleRadius as GatePoleRadius } from "./collision-system";

type GateElements = {
    gateNumber: number,
    group: Snap.Element,
    line: Snap.Element,
    rightPole: Snap.Element,
    leftPole: Snap.Element,

    gateSegment: Segment,

    lineMark?: Snap.Element,
    rightPoleMark?: Snap.Element,
    leftPoleMark?: Snap.Element,
}

export class GateVisualization {
    private gates: GateElements[] = [];

    static ApplyToSvg(svg: Snap.Paper): GateVisualization {
        const result = new GateVisualization();
        result.Init(svg);
        return result;
    }

    public DrawGateCollisions(collisions: GateCollision[], fromPoint?: Point) {
        const self = this;
        collisions.forEach(c => {
            const gate = self.gates.find(x => x.gateNumber == c.gateNumber);
            if (gate) {
                if (c.types.has("TouchLeft")) {
                    gate.leftPoleMark ??= self.useMark(gate.group, gate.gateSegment.pe, 'pole-collision-mark', fromPoint);
                }
                if (c.types.has("TouchRight")) {
                    gate.rightPoleMark ??= self.useMark(gate.group, gate.gateSegment.ps, 'pole-collision-mark', fromPoint);
                }
                if (c.types.has("Pass")) {
                    gate.lineMark ??= self.useMark(gate.group, gate.gateSegment.middle(), 'gate-pass-mark', fromPoint);
                }
                if (c.types.has("WrongDirection")) {
                    gate.lineMark ??= self.useMark(gate.group, gate.gateSegment.middle(), 'gate-collision-mark', fromPoint);
                }
            }
        });
    }

    private useMark(g: Snap.Element, point: Point, ref: string, fromPoint?: Point): Snap.Element {
        const use = g.paper.use(ref) as Snap.Element;
        if (fromPoint) {
            use.attr({ transform: `translate(${fromPoint.x}, ${fromPoint.y}) scale(5)` });
            g.add(use);
            use.animate({ transform: `translate(${point.x}, ${point.y}) scale(1)` }, 500);
        } else {
            use.attr({ x: point.x, y: point.y });
            g.add(use);
        }
        return use;
    }

    private Init(svg: Snap.Paper) {
        const root = svg.select("#gates-visualization");
        const positions = svg.selectAll(".gate-position");
        positions.forEach((el, idx) => {
            const gateElements = this.DrawGate(svg, el, idx);
            root.add(gateElements.group);
            this.gates.push(gateElements);
        });
        const finishPosition = svg.select('#finish-gate-position');
        if (finishPosition) {
            const gateElements = this.DrawFinish(svg, finishPosition);
            root.add(gateElements.group);
            this.gates.push(gateElements);
        }
    }
    private DrawFinish(svg: Snap.Paper, ref: Snap.Element): GateElements {
        const gate = this.DrawGenericGate(svg, ref);
        const color = ref.node.getAttribute("stroke");
        const lineVector = new Vector(gate.gateSegment.ps, gate.gateSegment.pe);
        const middle = gate.gateSegment.middle();
        const directionVector = lineVector.rotate90CW().normalize();
        const text = svg
            .text(middle.x - directionVector.x * -25, middle.y - directionVector.y * -25, 'ФИНИШ')
            .attr({
                fill: color,
                class: 'gate-number',
                'text-anchor': 'middle',
            });
        gate.group.add(text);
        return gate;
    }

    private DrawGate(svg: Snap.Paper, ref: Snap.Element, index?: number): GateElements {
        const gateNumber = index ? index + 1 : 1;
        const color = ref.node.getAttribute("stroke");
        const gate = this.DrawGenericGate(svg, ref);
        gate.gateNumber = gateNumber;
        const lineVector = new Vector(gate.gateSegment.ps, gate.gateSegment.pe);
        const middle = gate.gateSegment.middle();
        const directionVector = lineVector.rotate90CW().normalize();
        const marker = svg.select('#gate-direction-' + color);
        const direction = svg
            .line(
                middle.x - directionVector.x * -15,
                middle.y - directionVector.y * -15,
                middle.x - directionVector.x * 15,
                middle.y - directionVector.y * 15,
            )
            .attr({
                stroke: color,
                'marker-end': marker,
                'stroke-width': 2,
            });
        const text = svg
            .text(middle.x - directionVector.x * -25, middle.y - directionVector.y * -25, gateNumber)
            .attr({
                fill: color,
                class: 'gate-number',
                'text-anchor': 'middle',
            });

        gate.group.add(direction);
        gate.group.add(text);
        return gate;
    }

    private DrawGenericGate(svg: Snap.Paper, ref: Snap.Element): GateElements {
        const x1 = Number(ref.attr('x1'));
        const x2 = Number(ref.attr('x2'));
        const y1 = Number(ref.attr('y1'));
        const y2 = Number(ref.attr('y2'));
        const color = ref.node.getAttribute("stroke");
        const line = svg
            .line(x1, y1, x2, y2)
            .attr({
                stroke: color,
                'stroke-width': 5,
                'stroke-dasharray': '20 10',
            });
        const rightPole = svg
            .circle(x1, y1, GatePoleRadius)
            .attr({
                fill: color,
            });
        const leftPole = svg
            .circle(x2, y2, GatePoleRadius)
            .attr({
                fill: color,
            });
        const gateSegment = segment(point(x1, y1), point(x2, y2));

        return {
            gateNumber: undefined,
            group: svg.g(line, rightPole, leftPole),
            leftPole,
            rightPole,
            line,
            gateSegment,
        };
    }
}