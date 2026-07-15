import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmissionListComponent } from './emission-list'; // <-- Modifié ici

describe('EmissionListComponent', () => { // <-- Modifié ici
  let component: EmissionListComponent;  // <-- Modifié ici
  let fixture: ComponentFixture<EmissionListComponent>; // <-- Modifié ici

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmissionListComponent] // <-- Modifié ici
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmissionListComponent); // <-- Modifié ici
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});