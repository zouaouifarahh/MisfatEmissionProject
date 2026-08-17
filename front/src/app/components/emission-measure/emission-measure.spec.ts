import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { EmissionMeasureComponent } from './emission-measure';

describe('EmissionMeasureComponent', () => {
  let component: EmissionMeasureComponent;
  let fixture: ComponentFixture<EmissionMeasureComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        EmissionMeasureComponent,
        HttpClientTestingModule
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmissionMeasureComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});