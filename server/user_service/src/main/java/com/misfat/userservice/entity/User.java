package com.misfat.userservice.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import jakarta.persistence.*;

@Entity
@Table(name = "Utilisateurs") // Nom de la table dans MS SQL Server
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String username;
    private String email;
    private String firstName;
    private String lastName;

    @Enumerated(EnumType.STRING) // Sauvegarde en texte ("ADMINISTRATEUR") dans SQL Server
    private Role role;

    private String status; // "EN_ATTENTE", "ACTIF", "REFUSE"
    @Enumerated(EnumType.STRING)
    @Column(name = "usine", nullable = true)
    private Usine usine;
}