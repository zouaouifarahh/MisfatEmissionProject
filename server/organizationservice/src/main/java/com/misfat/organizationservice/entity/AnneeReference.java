package com.misfat.organizationservice.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "annee_reference")
public class AnneeReference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private Integer valeur;

    @Column(nullable = false, length = 20)
    private String statut; // "EN_COURS" ou "CLOTUREE"

    // Getters & setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Integer getValeur() { return valeur; }
    public void setValeur(Integer valeur) { this.valeur = valeur; }
    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }
}