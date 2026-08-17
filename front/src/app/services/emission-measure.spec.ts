import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EmissionMeasureService } from './emission-measure';

describe('EmissionMeasureService', () => {
  let service: EmissionMeasureService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EmissionMeasureService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(EmissionMeasureService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});