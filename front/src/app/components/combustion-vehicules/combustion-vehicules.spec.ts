import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { CombustionVehiculesComponent } from './combustion-vehicules';

describe('CombustionVehiculesComponent', () => {
  let component: CombustionVehiculesComponent;
  let fixture: ComponentFixture<CombustionVehiculesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CombustionVehiculesComponent],
      // L'écran lit désormais la base à l'initialisation. Sans dorsale de test,
      // la requête part pour de bon : le composant n'atteint jamais l'état
      // stable et la spec expire au bout de trente secondes.
      providers: [provideHttpClient(), provideHttpClientTesting()]
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