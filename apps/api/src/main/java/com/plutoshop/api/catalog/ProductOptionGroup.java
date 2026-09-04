package com.plutoshop.api.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "product_option_groups")
public class ProductOptionGroup {

    @Id
    @Column(name = "option_group", nullable = false, length = 120)
    private String optionGroup;

    @Column(name = "name_th", nullable = false, length = 180)
    private String nameTh;

    @Column(name = "name_en", nullable = false, length = 180)
    private String nameEn;

    @Column(name = "short_description_th", nullable = false, length = 500)
    private String shortDescriptionTh;

    @Column(name = "short_description_en", nullable = false, length = 500)
    private String shortDescriptionEn;

    protected ProductOptionGroup() {
    }

    public String getOptionGroup() {
        return optionGroup;
    }

    public String getNameTh() {
        return nameTh;
    }

    public String getNameEn() {
        return nameEn;
    }

    public String getShortDescriptionTh() {
        return shortDescriptionTh;
    }

    public String getShortDescriptionEn() {
        return shortDescriptionEn;
    }
}
