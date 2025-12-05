cmake_minimum_required(VERSION 3.15)
project(UV_Unwrapping_Algorithms)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Options
option(USE_LIBIGL "Use libigl library" ON)
option(USE_OPENMESH "Use OpenMesh library" ON)
option(USE_XATLAS "Use xatlas library" ON)
option(USE_UVATLAS "Use UVAtlas library" ON)

# Find packages
if(USE_LIBIGL)
    include(FetchContent)
    FetchContent_Declare(
        libigl
        GIT_REPOSITORY https://github.com/libigl/libigl.git
        GIT_TAG v2.5.0
    )
    FetchContent_MakeAvailable(libigl)
endif()

if(USE_OPENMESH)
    find_package(OpenMesh QUIET)
    if(NOT OpenMesh_FOUND)
        message(STATUS "OpenMesh not found, skipping...")
        set(USE_OPENMESH OFF)
    endif()
endif()

if(USE_XATLAS)
    message(STATUS "Attempting to fetch xatlas...")
    FetchContent_Declare(
        xatlas
        GIT_REPOSITORY https://github.com/jpcy/xatlas.git
        GIT_TAG master
    )
    FetchContent_GetProperties(xatlas)
    if(NOT xatlas_POPULATED)
        FetchContent_Populate(xatlas)
        # xatlas 没有 CMakeLists.txt，手动创建库
        add_library(xatlas STATIC 
            ${xatlas_SOURCE_DIR}/source/xatlas/xatlas.cpp
            ${xatlas_SOURCE_DIR}/source/xatlas/xatlas.h
        )
        target_include_directories(xatlas PUBLIC 
            ${xatlas_SOURCE_DIR}/source/xatlas
        )
        # xatlas 需要 C++11
        target_compile_features(xatlas PUBLIC cxx_std_11)
        message(STATUS "xatlas library created successfully")
    endif()
endif()

if(USE_UVATLAS AND WIN32)
    FetchContent_Declare(
        directxmesh
        GIT_REPOSITORY https://github.com/Microsoft/DirectXMesh.git
        GIT_TAG main
    )
    FetchContent_MakeAvailable(directxmesh)
elseif(USE_UVATLAS)
    message(STATUS "UVAtlas is only available on Windows, skipping...")
    set(USE_UVATLAS OFF)
endif()

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)

# Subdirectories
add_subdirectory(src)
add_subdirectory(examples)
