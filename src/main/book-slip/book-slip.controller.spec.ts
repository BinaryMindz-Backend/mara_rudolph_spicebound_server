import { Test, TestingModule } from '@nestjs/testing';
import { BookSlipController } from './book-slip.controller.js';

describe('BookSlipController', () => {
  let controller: BookSlipController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookSlipController],
    }).compile();

    controller = module.get<BookSlipController>(BookSlipController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
