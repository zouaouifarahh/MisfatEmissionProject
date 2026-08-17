package com.misfat.dataimportservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Trace d'un fichier Excel importé : périmètre (filiale / usine), volumétrie
 * traitée et état final.
 *
 * <p>{@code filialeId} et {@code usineId} sont de simples identifiants : les
 * entités correspondantes appartiennent à {@code organization-service}, on ne
 * crée donc pas de clé étrangère entre microservices.</p>
 */
@Entity
@Table(
        name = "import_log",
        indexes = {
                @Index(name = "ix_import_log_filiale", columnList = "filiale_id"),
                @Index(name = "ix_import_log_date", columnList = "import_date")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ImportLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "file_name", nullable = false, length = 260)
    private String fileName;

    @Column(name = "import_source_type_id", nullable = false)
    private Long importSourceTypeId;

    @Column(name = "filiale_id", nullable = false)
    private Long filialeId;

    @Column(name = "usine_id")
    private Long usineId;

    @Column(name = "import_date", nullable = false)
    private LocalDateTime importDate;

    @Column(name = "total_lines_processed")
    private Integer totalLinesProcessed;

    @Column(name = "success_count")
    private Integer successCount;

    @Column(name = "error_count")
    private Integer errorCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ImportStatus status;

    @Column(name = "imported_by", length = 120)
    private String importedBy;

    /**
     * Rejets ligne à ligne, tronqués pour rester lisibles. Le décompte exact
     * reste porté par {@code errorCount}.
     */
    @Column(name = "error_detail", length = 2000)
    private String errorDetail;
}
