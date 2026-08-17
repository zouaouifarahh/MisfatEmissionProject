package com.misfat.organizationservice.dto;

public class UsineDTO {
    private Long id;
    private String nom;
    private String emplacement;
    private Long filialeId;
    private String filialeCode;

    // Getters & setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNom() { return nom; }
    public void setNom(String nom) { this.nom = nom; }
    public String getEmplacement() { return emplacement; }
    public void setEmplacement(String emplacement) { this.emplacement = emplacement; }
    public Long getFilialeId() { return filialeId; }
    public void setFilialeId(Long filialeId) { this.filialeId = filialeId; }
    public String getFilialeCode() { return filialeCode; }
    public void setFilialeCode(String filialeCode) { this.filialeCode = filialeCode; }
}