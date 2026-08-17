import { TestBed } from '@angular/core/testing';

import { EmissionSourceService } from './emission-source';

describe('EmissionSourceService', () => {
  let service: EmissionSourceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EmissionSourceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
