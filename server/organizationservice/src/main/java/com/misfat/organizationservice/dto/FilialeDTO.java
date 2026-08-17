package com.misfat.organizationservice.dto;

import java.time.LocalDate;
import java.util.List;

public class FilialeDTO {
    private Long id;
    private String code;
    private String libelle;
    private String libelleCegid;
    private String codeD365fo;
    private String pays;
    private String devise;
    private LocalDate dateCreation;
    private List<UsineDTO> usines;

    /**
     * Nombre d'usines rattachées.
     *
     * <p>Exposé à part de {@link #usines} : l'écran de gestion des sociétés
     * n'affiche que le compte, et n'a pas à parcourir la collection pour
     * l'obtenir.</p>
     */
    private int nombreUsines;

    // Getters & setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getLibelle() { return libelle; }
    public void setLibelle(String libelle) { this.libelle = libelle; }
    public String getLibelleCegid() { return libelleCegid; }
    public void setLibelleCegid(String libelleCegid) { this.libelleCegid = libelleCegid; }
    public String getCodeD365fo() { return codeD365fo; }
    public void setCodeD365fo(String codeD365fo) { this.codeD365fo = codeD365fo; }
    public String getPays() { return pays; }
    public void setPays(String pays) { this.pays = pays; }
    public String getDevise() { return devise; }
    public void setDevise(String devise) { this.devise = devise; }
    public LocalDate getDateCreation() { return dateCreation; }
    public void setDateCreation(LocalDate dateCreation) { this.dateCreation = dateCreation; }
    public List<UsineDTO> getUsines() { return usines; }
    public void setUsines(List<UsineDTO> usines) { this.usines = usines; }
    public int getNombreUsines() { return nombreUsines; }
    public void setNombreUsines(int nombreUsines) { this.nombreUsines = nombreUsines; }
}