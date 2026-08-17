import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CombustionVehiculesComponent } from './combustion-vehicules';

describe('CombustionVehiculesComponent', () => {
  let component: CombustionVehiculesComponent;
  let fixture: ComponentFixture<CombustionVehiculesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CombustionVehiculesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CombustionVehiculesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});