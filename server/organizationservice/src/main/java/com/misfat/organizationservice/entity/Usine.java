package com.misfat.organizationservice.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "usine")
public class Usine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String nom;

    @Column(length = 150)
    private String emplacement;

    @ManyToOne
    @JoinColumn(name = "filiale_id", nullable = false)
    private Filiale filiale;

    // Getters & setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNom() { return nom; }
    public void setNom(String nom) { this.nom = nom; }
    public String getEmplacement() { return emplacement; }
    public void setEmplacement(String emplacement) { this.emplacement = emplacement; }
    public Filiale getFiliale() { return filiale; }
    public void setFiliale(Filiale filiale) { this.filiale = filiale; }
}