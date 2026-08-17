package com.misfat.emissionservice.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * Trace d'un import du référentiel carbone.
 *
 * <p>Table propre à emission-service : {@code import_log} appartient à
 * data-import-service et journalise les relevés d'activité, pas le référentiel.
 * Chaque service reste maître de ses tables.</p>
 */
@Entity
@Table(name = "referential_import_log")
public class ReferentialImportLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "file_name", nullable = false, length = 260)
    private String fileName;

    @Column(name = "import_date", nullable = false)
    private LocalDateTime importDate;

    /** Lignes de données rencontrées, en-tête exclu. */
    @Column(name = "total_rows")
    private Integer totalRows;

    @Column(name = "created_references")
    private Integer createdReferences;

    @Column(name = "created_sources")
    private Integer createdSources;

    @Column(name = "created_factors")
    private Integer createdFactors;

    /** Facteurs existants réalignés sur le fichier : valeur, source, validité. */
    @Column(name = "updated_factors")
    private Integer updatedFactors;

    @Column(name = "error_count")
    private Integer errorCount;

    @Column(name = "status", length = 20)
    private String status;

    @Column(name = "error_detail", length = 2000)
    private String errorDetail;

    @Column(name = "imported_by", length = 120)
    private String importedBy;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public LocalDateTime getImportDate() { return importDate; }
    public void setImportDate(LocalDateTime importDate) { this.importDate = importDate; }
    public Integer getTotalRows() { return totalRows; }
    public void setTotalRows(Integer totalRows) { this.totalRows = totalRows; }
    public Integer getCreatedReferences() { return createdReferences; }
    public void setCreatedReferences(Integer v) { this.createdReferences = v; }
    public Integer getCreatedSources() { return createdSources; }
    public void setCreatedSources(Integer v) { this.createdSources = v; }
    public Integer getCreatedFactors() { return createdFactors; }
    public void setCreatedFactors(Integer v) { this.createdFactors = v; }
    public Integer getUpdatedFactors() { return updatedFactors; }
    public void setUpdatedFactors(Integer v) { this.updatedFactors = v; }
    public Integer getErrorCount() { return errorCount; }
    public void setErrorCount(Integer v) { this.errorCount = v; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getErrorDetail() { return errorDetail; }
    public void setErrorDetail(String errorDetail) { this.errorDetail = errorDetail; }
    public String getImportedBy() { return importedBy; }
    public void setImportedBy(String importedBy) { this.importedBy = importedBy; }
}
