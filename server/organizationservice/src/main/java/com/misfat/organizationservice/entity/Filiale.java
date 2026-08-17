package com.misfat.organizationservice.entity;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "filiale")
public class Filiale {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 10)
    private String code;

    @Column(nullable = false, length = 150)
    private String libelle;

    @Column(name = "libelle_cegid", length = 150)
    private String libelleCegid;

    @Column(name = "code_d365fo", length = 50)
    private String codeD365fo;

    // Les trois colonnes suivantes sont nullables à dessein : ddl-auto=update ne
    // peut pas ajouter de colonne NOT NULL à une table déjà peuplée. Le
    // chargeur de démarrage renseigne les filiales existantes.

    /** Pays d'implantation, qui détermine le drapeau affiché. */
    @Column(name = "pays", length = 60)
    private String pays;

    /** Devise principale de la filiale : TND, EUR, MAD… */
    @Column(name = "devise", length = 3)
    private String devise;

    @Column(name = "date_creation")
    private LocalDate dateCreation;

    @OneToMany(mappedBy = "filiale", cascade = CascadeType.ALL)
    private List<Usine> usines = new ArrayList<>();

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
    public List<Usine> getUsines() { return usines; }
    public void setUsines(List<Usine> usines) { this.usines = usines; }
}