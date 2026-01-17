import { Test, TestingModule } from '@nestjs/testing';
import { BookSlipService } from './book-slip.service';

describe('BookSlipService', () => {
  let service: BookSlipService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BookSlipService],
    }).compile();

    service = module.get<BookSlipService>(BookSlipService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
