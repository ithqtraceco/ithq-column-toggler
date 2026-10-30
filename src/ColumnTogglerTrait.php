<?php

declare(strict_types = 1);

namespace DigitalCreative\ColumnToggler;

use Laravel\Nova\Fields\Field;
use Laravel\Nova\Fields\FieldCollection;
use Laravel\Nova\Http\Requests\NovaRequest;
use Laravel\Nova\Resource;

/**
 * @mixin Resource
 */
trait ColumnTogglerTrait
{
    public function serializeForIndex(NovaRequest $request, $fields = null)
    {
        $indexFields = ($fields ?? parent::indexFields($request))->values();

        $columns = $indexFields->map(fn (Field $field, int $index) => [
            'attribute' => $this->generateAttributeName($field, $index),
            'label' => $field->name,
            'visible' => data_get($field->meta(), 'columnToggleVisible', true),
        ]);

        return array_merge(parent::serializeForIndex($request, $this->filterFields($request, $indexFields)), [
            'columnToggler' => $columns,
        ]);
    }

    public function indexFields(NovaRequest $request): FieldCollection
    {
        return $this->filterFields($request, parent::indexFields($request));
    }

    private function filterFields(NovaRequest $request, FieldCollection $fields): FieldCollection
    {
        // Index-based so two different fields sharing the same name+attribute
        // (e.g. two closure-based fields with the same label — Nova gives
        // every computed field the literal attribute "ComputedField", so
        // name+attribute alone isn't unique) don't collide onto the same
        // hash. A collision used to mean selecting one of them silently
        // pulled BOTH into the table, including fields explicitly marked
        // hideFromIndex(). Position in the (always-full, unfiltered)
        // indexFields() collection is stable across requests for a given
        // resource, since field definitions don't change at runtime.
        $fields = $fields->values();

        return $fields->when(
            value: $request->has('columnToggler') && !$request->routeIs('nova.column-toggler.fields'),
            callback: function (FieldCollection $fields) use ($request) {

                $value = $request->input('columnToggler');

                /**
                 * If the value is a boolean we return all fields, since this is the very first request
                 * we don't have any columns to filter by yet.
                 */
                if ($value === 'true') {

                    return $fields->filter(function (Field $field) {
                        return data_get($field->meta(), 'columnToggleVisible', true);
                    });

                }

                if ($value === 'false') {
                    return new FieldCollection();
                }

                $columns = collect(json_decode(base64_decode($value)));

                return $fields
                    ->filter(fn (Field $field, int $index) => $columns->contains($this->generateAttributeName($field, $index)))
                    ->sortBy(fn (Field $field, int $index) => $columns->search($this->generateAttributeName($field, $index)));

            },
        )->values();
    }

    private function generateAttributeName(Field $field, int $index): string
    {
        return md5(sprintf('%s-%s-%d', $field->name, $field->attribute, $index));
    }
}
