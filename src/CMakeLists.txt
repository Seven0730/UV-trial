# Source library
set(UV_UNWRAPPING_SOURCES
    edge_loop_segmentation.cpp
    curvature_segmentation.cpp
    advanced_segmentation.cpp
    lscm_unwrapping.cpp
    abf_unwrapping.cpp
    xatlas_wrapper.cpp
    # uvatlas_wrapper.cpp  # Commented out - Windows only
)

add_library(uv_unwrapping STATIC ${UV_UNWRAPPING_SOURCES})

target_include_directories(uv_unwrapping PUBLIC
    ${CMAKE_SOURCE_DIR}/include
)

# Link libraries
if(USE_LIBIGL)
    target_link_libraries(uv_unwrapping PUBLIC igl::core)
endif()

if(USE_XATLAS AND TARGET xatlas)
    target_link_libraries(uv_unwrapping PUBLIC xatlas)
endif()

# Set C++17
target_compile_features(uv_unwrapping PUBLIC cxx_std_17)
