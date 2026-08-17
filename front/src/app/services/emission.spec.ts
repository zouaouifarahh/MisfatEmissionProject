import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { EmissionService } from './emission';

describe('EmissionService', () => {
  let service: EmissionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [EmissionService]
    });
    service = TestBed.inject(EmissionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});