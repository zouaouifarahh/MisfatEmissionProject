package com.misfat.organizationservice.dto;

public class AnneeReferenceDTO {
    private Long id;
    private Integer valeur;
    private String statut;

    // Getters & setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Integer getValeur() { return valeur; }
    public void setValeur(Integer valeur) { this.valeur = valeur; }
    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }
}