import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../user.service';

@Component({
  selector: 'app-user-approval',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-approval.html',
  styleUrls: ['./user-approval.component.css']
})
export class UserApprovalComponent implements OnInit {
  usersInPending: any[] = [];
  messageSuccess = '';
  messageError = '';

  constructor(private userService: UserService) {}

  ngOnInit() {
    this.loadPendingUsers();
  }

  loadPendingUsers() {
    this.userService.getUsers().subscribe({
      next: (data: any[]) => {
        if (Array.isArray(data)) {
          this.usersInPending = data.filter((user: any) => user.status === 'EN_ATTENTE');
        }
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des demandes', err);
      }
    });
  }

  onApprove(userId: number) {
    this.messageSuccess = '';
    this.messageError = '';

    // Cet appel à 1 seul argument ne lèvera plus d'erreur TS2554 !
    this.userService.approveUser(userId).subscribe({
      next: (response: any) => {
        this.messageSuccess = "L'utilisateur a été approuvé avec succès et activé sur Keycloak.";
        this.loadPendingUsers(); 
      },
      error: (err: any) => {
        this.messageError = err.error || "Une erreur est survenue pendant l'approbation.";
      }
    });
  }
}