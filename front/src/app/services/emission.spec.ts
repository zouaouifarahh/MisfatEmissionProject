import { TestBed } from '@angular/core/testing';

import { Emission } from './emission';

describe('Emission', () => {
  let service: Emission;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Emission);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
