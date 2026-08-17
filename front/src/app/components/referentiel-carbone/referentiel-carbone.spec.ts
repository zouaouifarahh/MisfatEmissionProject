import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReferentielCarboneComponent } from './referentiel-carbone';

describe('ReferentielCarboneComponent', () => {
  let component: ReferentielCarboneComponent;
  let fixture: ComponentFixture<ReferentielCarboneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReferentielCarboneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReferentielCarboneComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
