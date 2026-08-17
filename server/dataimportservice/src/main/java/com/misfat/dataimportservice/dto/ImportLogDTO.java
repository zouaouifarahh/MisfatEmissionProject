package com.misfat.dataimportservice.dto;

import com.misfat.dataimportservice.entity.ImportStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ImportLogDTO {

    private Long id;

    @NotBlank(message = "Le nom du fichier est obligatoire")
    @Size(max = 260, message = "Le nom du fichier ne peut dépasser 260 caractères")
    private String fileName;

    @NotNull(message = "Le type de source d'import est obligatoire")
    private Long importSourceTypeId;

    @NotNull(message = "La filiale est obligatoire")
    private Long filialeId;

    /** Optionnel : un import peut couvrir toute la filiale. */
    private Long usineId;

    /** Positionné par le service à l'ouverture du log. */
    private LocalDateTime importDate;

    @PositiveOrZero(message = "Le nombre de lignes traitées ne peut être négatif")
    private Integer totalLinesProcessed;

    @PositiveOrZero(message = "Le nombre de succès ne peut être négatif")
    private Integer successCount;

    @PositiveOrZero(message = "Le nombre d'erreurs ne peut être négatif")
    private Integer errorCount;

    /** Positionné par le service : {@code IN_PROGRESS} puis état final. */
    private ImportStatus status;

    @Size(max = 120, message = "L'auteur de l'import ne peut dépasser 120 caractères")
    private String importedBy;

    /** Libellé du type de source, résolu à la lecture pour éviter un appel côté client. */
    private String importSourceTypeName;

    /** Rejets ligne à ligne, renseigné à la clôture d'un import partiel ou échoué. */
    private String errorDetail;
}
