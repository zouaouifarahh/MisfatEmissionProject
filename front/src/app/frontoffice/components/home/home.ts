import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {
  totalEmissions: string = '145 825';
  scope1Emissions: string = '11 813';
  scope2Emissions: string = '7 218';
  scope3Emissions: string = '126 794';
}