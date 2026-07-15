import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  user = {
    firstName: 'Farah',
    lastName: 'Zwawi',
    role: 'ADMINISTRATEUR',
    username: 'f.zwawi',
    email: 'f.zwawi@misfat.com.tn',
    usine: 'USINE MISFAT 1'
  };

  avatarUrl: string = 'assets/default-avatar.png'; 
  notes: string[] = [];
  nouvelleNote: string = '';

  // Variables pour la modification
  noteEnEdition: number | null = null;
  texteModifie: string = '';

  ngOnInit() {
    const savedAvatar = localStorage.getItem('profile_avatar');
    if (savedAvatar) {
      this.avatarUrl = savedAvatar;
    }

    const savedNotes = localStorage.getItem('profile_notes');
    if (savedNotes) {
      this.notes = JSON.parse(savedNotes);
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.avatarUrl = e.target.result;
        localStorage.setItem('profile_avatar', this.avatarUrl);
      };
      reader.readAsDataURL(file);
    }
  }

  ajouterNote(event: Event) {
    event.preventDefault(); 
    if (this.nouvelleNote.trim() !== '') {
      this.notes.push(this.nouvelleNote.trim());
      this.nouvelleNote = ''; 
      localStorage.setItem('profile_notes', JSON.stringify(this.notes));
    }
  }

  // Activer le mode édition pour une note précise
  activerEdition(index: number, texteActuel: string) {
    this.noteEnEdition = index;
    this.texteModifie = texteActuel;
  }

  // Enregistrer les changements apportés à la note
  sauvegarderModification(index: number) {
    if (this.texteModifie.trim() !== '') {
      this.notes[index] = this.texteModifie.trim();
      localStorage.setItem('profile_notes', JSON.stringify(this.notes));
    }
    this.annulerEdition();
  }

  // Quitter le mode édition sans enregistrer
  annulerEdition() {
    this.noteEnEdition = null;
    this.texteModifie = '';
  }

  supprimerNote(index: number) {
    this.notes.splice(index, 1);
    localStorage.setItem('profile_notes', JSON.stringify(this.notes));
    if (this.noteEnEdition === index) {
      this.annulerEdition();
    }
  }
}