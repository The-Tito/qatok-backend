import {
  AdminSimulationQuery,
  PublishSimulationInput,
  SimulationContentInput,
  SimulationInput,
  Uuid,
} from '@qatok/shared';
import type { Request, Response } from 'express';
import type { SimulationService } from '../services/simulation.service.js';

const simulationId = (request: Request) => Uuid.parse(request.params.simulationId).toLowerCase();

export function createSimulationController(simulations: SimulationService) {
  return {
    async list(request: Request, response: Response) {
      response.json(await simulations.list(AdminSimulationQuery.parse(request.query)));
    },
    async get(request: Request, response: Response) {
      response.json(await simulations.get(simulationId(request)));
    },
    async create(request: Request, response: Response) {
      response.status(201).json(await simulations.save(null, SimulationInput.parse(request.body)));
    },
    async update(request: Request, response: Response) {
      response.json(
        await simulations.save(simulationId(request), SimulationInput.parse(request.body)),
      );
    },
    async getContent(request: Request, response: Response) {
      response.json(await simulations.getContent(simulationId(request)));
    },
    async saveContent(request: Request, response: Response) {
      const { version, steps } = SimulationContentInput.parse(request.body);
      response.json(await simulations.saveContent(simulationId(request), version, steps));
    },
    async publish(request: Request, response: Response) {
      const { version } = PublishSimulationInput.parse(request.body);
      response.json(await simulations.publish(simulationId(request), version));
    },
    async deactivate(request: Request, response: Response) {
      response.json(await simulations.deactivate(simulationId(request)));
    },
    async deleteDraft(request: Request, response: Response) {
      await simulations.deleteDraft(simulationId(request));
      response.sendStatus(204);
    },
  };
}
