package com.misfat.dataimportservice.dto;

import com.misfat.dataimportservice.entity.ExcelStructureType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ImportSourceTypeDTO {

    /** Renseigné en sortie ; ignoré en création. */
    private Long id;

    @NotBlank(message = "Le code technique est obligatoire")
    @Size(max = 60, message = "Le code technique ne peut dépasser 60 caractères")
    @Pattern(
            regexp = "^[A-Z0-9_]+$",
            message = "Le code technique doit être en majuscules, chiffres et underscores (ex. ACHAT_BIENS)"
    )
    private String codeName;

    @NotBlank(message = "Le libellé est obligatoire")
    @Size(max = 120, message = "Le libellé ne peut dépasser 120 caractères")
    private String displayName;

    @NotBlank(message = "Le scope cible est obligatoire")
    @Pattern(regexp = "SCOPE_1|SCOPE_2|SCOPE_3", message = "Le scope doit valoir SCOPE_1, SCOPE_2 ou SCOPE_3")
    private String scopeTarget;

    @NotBlank(message = "La catégorie cible est obligatoire")
    @Size(max = 150, message = "La catégorie ne peut dépasser 150 caractères")
    private String categoryTarget;

    @NotNull(message = "La structure Excel est obligatoire (ROW_BY_ROW ou MONTHLY_MATRIX)")
    private ExcelStructureType excelStructureType;

    /** Absent en création : le service applique {@code true} par défaut. */
    private Boolean active;
}
